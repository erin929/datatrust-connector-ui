import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { Readable } from "node:stream";
import type {
  HandshakeLogEntry,
  HandshakeRequest,
  HandshakeResult,
  NativeProcessResult,
} from "../shared/runtime-contract.js";
import { GatewayError } from "./gateway-error.js";
import { parseNativeOutcome } from "./handshake-parser.js";
import type { NativeRuntimeConfig } from "./runtime-config.js";
import {
  buildRemoteProgramCommand,
  buildSshArgs,
  quotePosixShell,
  runSshCommand,
} from "./ssh-transport.js";

const MAX_OUTPUT_BYTES = 1024 * 1024;
const EMPTY_PROCESS_RESULT: NativeProcessResult = { exitCode: null, signal: null };

type ProcessSource = "client" | "server";
type RunningNativeProcess = {
  child: ChildProcess;
  completion: Promise<NativeProcessResult>;
};
type ProcessSpec = { executablePath: string; args: string[]; workingDirectory: string };
type PairExecution = {
  started: Date;
  finished: Date;
  logs: HandshakeLogEntry[];
  clientResult: NativeProcessResult;
  serverResult: NativeProcessResult | null;
  timedOut: boolean;
};

function didProfileReady(config: NativeRuntimeConfig) {
  return Boolean(
    config.didCertificatePath &&
      config.didKeyPath &&
      existsSync(config.didCertificatePath) &&
      existsSync(config.didKeyPath),
  );
}

export function buildNativeArgs(config: NativeRuntimeConfig, request: HandshakeRequest) {
  if (
    request.authMode !== "traditional" &&
    (!config.indyGenesisPath || !existsSync(config.indyGenesisPath))
  ) {
    throw new GatewayError(
      422,
      "INDY_LEDGER_NOT_CONFIGURED",
      "DID / Auto 模式需要配置可读取的 INDY_GENESIS_PATH。",
    );
  }
  const args = [
    ...config.prefixArgs,
    "--auth-mode",
    request.authMode,
    "--host",
    config.target.host,
    "--port",
    String(config.target.port),
  ];
  if (request.authMode !== "traditional" && request.mutualTls) {
    if (!didProfileReady(config)) {
      throw new GatewayError(
        422,
        "DID_CERT_PROFILE_NOT_CONFIGURED",
        "DID 模式需要在 Gateway .env 中配置可读取的 HITLS_DID_CERT 和 HITLS_DID_KEY。",
      );
    }
    args.push("--cert", config.didCertificatePath!, "--key", config.didKeyPath!);
  } else if (request.mutualTls) {
    args.push("--mtls");
  }
  return args;
}

function serverDidProfileReady(config: NativeRuntimeConfig) {
  const server = config.managedServer;
  return Boolean(
    server.didCertificatePath &&
      server.didKeyPath &&
      existsSync(server.didCertificatePath) &&
      existsSync(server.didKeyPath),
  );
}

export function buildNativeServerArgs(config: NativeRuntimeConfig, request: HandshakeRequest) {
  const args = ["--auth-mode", request.authMode, "--port", String(config.target.port)];
  if (request.authMode !== "traditional") {
    if (!serverDidProfileReady(config)) {
      throw new GatewayError(
        422,
        "DID_SERVER_PROFILE_NOT_CONFIGURED",
        "托管 DID / Auto 服务器需要配置 HITLS_SERVER_DID_CERT 和 HITLS_SERVER_DID_KEY。",
      );
    }
    args.push(
      "--cert",
      config.managedServer.didCertificatePath!,
      "--key",
      config.managedServer.didKeyPath!,
    );
  }
  if (request.mutualTls) args.push("--mtls");
  return args;
}

function requireHardwareConfig(config: NativeRuntimeConfig) {
  if (!config.ssh) {
    throw new GatewayError(503, "SSH_NOT_CONFIGURED", "SSH 硬件传输层尚未配置。");
  }
  return config.ssh;
}

function rejectUnsupportedHardwareAuto(request: HandshakeRequest) {
  if (request.authMode === "auto") {
    throw new GatewayError(
      422,
      "AUTH_MODE_UNSUPPORTED",
      "最新版板卡 tls_client/tls_server 没有与旧 Auto 等价的模式；请使用 Traditional TLS 或 DID-TLS。",
    );
  }
}

export function buildHardwareClientArgs(
  config: NativeRuntimeConfig,
  request: HandshakeRequest,
) {
  rejectUnsupportedHardwareAuto(request);
  const client = requireHardwareConfig(config).client;
  const args: string[] = [];
  if (request.authMode === "did") args.push("--did");
  if (request.mutualTls) {
    if (!client.didCertificatePath || !client.didKeyPath) {
      throw new GatewayError(
        422,
        "CLIENT_CERT_PROFILE_NOT_CONFIGURED",
        "板卡 mTLS 需要配置远程客户端证书和私钥路径。",
      );
    }
    args.push(
      "--mtls",
      "--client-cert",
      client.didCertificatePath,
      "--client-key",
      client.didKeyPath,
    );
  }
  return args;
}

export function buildHardwareServerArgs(
  config: NativeRuntimeConfig,
  request: HandshakeRequest,
) {
  rejectUnsupportedHardwareAuto(request);
  const server = requireHardwareConfig(config).server;
  const args: string[] = [];
  if (request.authMode === "did") {
    if (!server.didCertificatePath || !server.didKeyPath) {
      throw new GatewayError(
        422,
        "DID_SERVER_PROFILE_NOT_CONFIGURED",
        "板卡 DID 服务器需要配置远程服务器证书和私钥路径。",
      );
    }
    args.push(
      "--did",
      "--server-cert",
      server.didCertificatePath,
      "--server-key",
      server.didKeyPath,
    );
  }
  if (request.mutualTls) args.push("--mtls");
  return args;
}

function logLevel(message: string): HandshakeLogEntry["level"] {
  if (/\[ERROR\]|失败|failed|error/iu.test(message)) return "error";
  if (/\[WARN\]|警告|warning/iu.test(message)) return "warning";
  return "info";
}

function attachLineCollector(
  stream: Readable,
  streamName: HandshakeLogEntry["stream"],
  pushLine: (streamName: HandshakeLogEntry["stream"], line: string) => void,
) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/u);
    pending = lines.pop() ?? "";
    for (const line of lines) pushLine(streamName, line);
  });
  return () => {
    if (pending) pushLine(streamName, pending);
    pending = "";
  };
}

function startNativeProcess(
  spec: ProcessSpec,
  source: ProcessSource,
  pushLine: (source: ProcessSource, stream: HandshakeLogEntry["stream"], line: string) => void,
): RunningNativeProcess {
  const child = spawn(spec.executablePath, spec.args, {
    cwd: spec.workingDirectory,
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const completion = new Promise<NativeProcessResult>((resolve, reject) => {
    const flushStdout = attachLineCollector(child.stdout, "stdout", (stream, line) =>
      pushLine(source, stream, line),
    );
    const flushStderr = attachLineCollector(child.stderr, "stderr", (stream, line) =>
      pushLine(source, stream, line),
    );
    child.once("error", (error) => {
      reject(
        new GatewayError(502, "PROCESS_SPAWN_FAILED", `无法启动 openHiTLS ${source} 进程。`, {
          cause: error.message,
        }),
      );
    });
    child.once("close", (exitCode, signal) => {
      flushStdout();
      flushStderr();
      resolve({ exitCode, signal });
    });
  });
  return { child, completion };
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function executeProcessPair(options: {
  request: HandshakeRequest;
  client: ProcessSpec;
  server?: ProcessSpec;
  waitForServer?: () => Promise<void>;
  onServerLine?: (line: string) => void;
  cleanup?: () => Promise<void>;
}): Promise<PairExecution> {
  const started = new Date();
  const logs: HandshakeLogEntry[] = [];
  let sequence = 0;
  let outputBytes = 0;
  let timedOut = false;
  let outputLimitExceeded = false;
  let clientProcess: RunningNativeProcess | null = null;
  let serverProcess: RunningNativeProcess | null = null;
  let clientResult = EMPTY_PROCESS_RESULT;
  let serverResult: NativeProcessResult | null = null;

  const forceStop = () => {
    clientProcess?.child.kill();
    serverProcess?.child.kill();
  };
  const pushLine = (
    source: ProcessSource,
    stream: HandshakeLogEntry["stream"],
    rawLine: string,
  ) => {
    const message = rawLine.trimEnd();
    if (!message) return;
    outputBytes += Buffer.byteLength(message, "utf8");
    if (outputBytes > MAX_OUTPUT_BYTES) {
      outputLimitExceeded = true;
      forceStop();
      return;
    }
    if (source === "server") options.onServerLine?.(message);
    logs.push({ sequence: sequence++, source, stream, level: logLevel(message), message });
  };
  const gatewayLog = (message: string, level: HandshakeLogEntry["level"] = "info") => {
    logs.push({ sequence: sequence++, source: "gateway", stream: "stdout", level, message });
  };

  try {
    if (options.server) {
      serverProcess = startNativeProcess(options.server, "server", pushLine);
      const serverExitedEarly = serverProcess.completion.then((result) => {
        throw new GatewayError(
          502,
          "NATIVE_SERVER_EXITED",
          "openHiTLS 服务器在客户端启动前退出。",
          { ...result, logs: logs.slice(-20) },
        );
      });
      if (options.waitForServer) {
        await Promise.race([options.waitForServer(), serverExitedEarly]);
      }
      gatewayLog("服务端监听已确认，开始启动客户端。");
    }

    clientProcess = startNativeProcess(options.client, "client", pushLine);
    const timeout = setTimeout(() => {
      timedOut = true;
      forceStop();
    }, options.request.timeoutMs);
    clientResult = await clientProcess.completion.finally(() => clearTimeout(timeout));

    if (serverProcess) {
      const serverCompletion = await Promise.race([
        serverProcess.completion.then((result) => ({ completed: true as const, result })),
        delay(1500).then(() => ({ completed: false as const, result: null })),
      ]);
      if (serverCompletion.completed) {
        serverResult = serverCompletion.result;
      } else {
        serverProcess.child.kill();
        serverResult = await Promise.race([
          serverProcess.completion,
          delay(1000).then(() => EMPTY_PROCESS_RESULT),
        ]);
      }
    }

    if (outputLimitExceeded) {
      logs.push({
        sequence: sequence++,
        source: "gateway",
        stream: "stderr",
        level: "error",
        message: "Gateway 已终止原生进程：输出超过 1 MiB 安全上限。",
      });
    }
    return { started, finished: new Date(), logs, clientResult, serverResult, timedOut };
  } catch (error) {
    forceStop();
    throw error;
  } finally {
    if (options.cleanup) {
      try {
        await options.cleanup();
      } catch (error) {
        gatewayLog(
          `远程进程清理失败：${error instanceof Error ? error.message : "unknown error"}`,
          "warning",
        );
      }
    }
  }
}

function resultFromExecution(
  config: NativeRuntimeConfig,
  request: HandshakeRequest,
  id: string,
  execution: PairExecution,
): HandshakeResult {
  const parsed = parseNativeOutcome(
    execution.logs,
    request.authMode,
    execution.clientResult.exitCode,
    execution.timedOut,
    request.mutualTls,
  );
  const localCertificateMode = !request.mutualTls
    ? "UNKNOWN"
    : request.authMode === "traditional"
      ? "NORMAL"
      : "DID";
  const authModeValue = request.authMode === "traditional" ? 1 : request.authMode === "did" ? 2 : 3;

  return {
    id,
    startedAt: execution.started.toISOString(),
    finishedAt: execution.finished.toISOString(),
    status: parsed.status,
    request,
    process: {
      ...execution.clientResult,
      client: execution.clientResult,
      server: execution.serverResult,
    },
    connection: {
      target: config.target,
      completed: parsed.completed,
      durationMs: execution.finished.getTime() - execution.started.getTime(),
      nativeHandshakeMs: parsed.nativeHandshakeMs,
      hitlsCode: parsed.hitlsCode,
      tlsAlert: parsed.tlsAlert,
      tlsVersion: null,
    },
    negotiation: {
      localCertificateMode,
      peerCertificateMode: parsed.didVerification.status === "succeeded" ? "DID" : "UNKNOWN",
      clientDidAuthMode: authModeValue,
      serverDidAuthMode: config.managedServer.enabled ? authModeValue : null,
      fallbackMode: config.transport === "local" && request.authMode === "auto",
    },
    didVerification: parsed.didVerification,
    logs: execution.logs,
  };
}

async function runLocalHandshake(config: NativeRuntimeConfig, request: HandshakeRequest) {
  const clientArgs = buildNativeArgs(config, request);
  let resolveServerReady: (() => void) | null = null;
  const serverReady = new Promise<void>((resolve) => {
    resolveServerReady = resolve;
  });
  let serverSpec: ProcessSpec | undefined;
  let waitForServer: (() => Promise<void>) | undefined;

  if (config.managedServer.enabled) {
    serverSpec = {
      executablePath: config.managedServer.executablePath!,
      args: buildNativeServerArgs(config, request),
      workingDirectory: config.managedServer.workingDirectory,
    };
    waitForServer = async () => {
      const startupTimedOut = delay(config.managedServer.startupTimeoutMs).then(() => {
        throw new GatewayError(
          504,
          "NATIVE_SERVER_START_TIMEOUT",
          "等待 openHiTLS 服务器 [READY] 标记超时。",
        );
      });
      await Promise.race([serverReady, startupTimedOut]);
    };
  }

  const execution = await executeProcessPair({
    request,
    client: {
      executablePath: config.executablePath!,
      args: clientArgs,
      workingDirectory: config.workingDirectory,
    },
    server: serverSpec,
    waitForServer,
    onServerLine: (line) => {
      if (line.includes("[READY]")) resolveServerReady?.();
    },
  });
  resolveServerReady = null;
  return execution;
}

function serverReadinessCommand(port: number, timeoutMs: number) {
  const attempts = Math.max(1, Math.ceil(timeoutMs / 200));
  const pattern = `:${port}([[:space:]]|$)`;
  return `i=0; while test "$i" -lt ${attempts}; do if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | grep -Eq ${quotePosixShell(pattern)}; then exit 0; fi; if command -v netstat >/dev/null 2>&1 && netstat -ltn 2>/dev/null | grep -Eq ${quotePosixShell(pattern)}; then exit 0; fi; i=$((i + 1)); sleep 0.2; done; printf 'PORT_NOT_LISTENING'; exit 41`;
}

async function runHardwareHandshake(config: NativeRuntimeConfig, request: HandshakeRequest, id: string) {
  const ssh = requireHardwareConfig(config);
  const clientArgs = buildHardwareClientArgs(config, request);
  const serverArgs = buildHardwareServerArgs(config, request);
  const serverPidFile = `/tmp/datatrust-connector-${id}-server.pid`;
  const clientPidFile = `/tmp/datatrust-connector-${id}-client.pid`;
  const pidPrelude = (pidFile: string) =>
    `umask 077 && printf '%s\\n' "$$" > ${quotePosixShell(pidFile)}`;
  const cleanupCommand = (pidFile: string) =>
    `if test -f ${quotePosixShell(pidFile)}; then pid=$(cat ${quotePosixShell(pidFile)}); case "$pid" in ''|*[!0-9]*) ;; *) kill "$pid" 2>/dev/null || true ;; esac; rm -f ${quotePosixShell(pidFile)}; fi`;
  const serverRemoteCommand = buildRemoteProgramCommand(
    ssh.server,
    serverArgs,
    pidPrelude(serverPidFile),
  );
  const clientRemoteCommand = buildRemoteProgramCommand(
    ssh.client,
    clientArgs,
    pidPrelude(clientPidFile),
  );

  return executeProcessPair({
    request,
    server: {
      executablePath: ssh.executablePath,
      args: buildSshArgs(ssh, ssh.server, serverRemoteCommand),
      workingDirectory: process.cwd(),
    },
    client: {
      executablePath: ssh.executablePath,
      args: buildSshArgs(ssh, ssh.client, clientRemoteCommand),
      workingDirectory: process.cwd(),
    },
    waitForServer: async () => {
      const readiness = await runSshCommand(
        ssh,
        ssh.server,
        serverReadinessCommand(config.target.port, config.managedServer.startupTimeoutMs),
        config.managedServer.startupTimeoutMs + ssh.connectTimeoutMs,
      );
      if (readiness.timedOut || readiness.exitCode !== 0) {
        throw new GatewayError(
          504,
          "NATIVE_SERVER_START_TIMEOUT",
          `板卡21未在 ${config.target.port} 端口进入监听状态。`,
          {
            stdout: readiness.stdout,
            stderr: readiness.stderr,
            exitCode: readiness.exitCode,
          },
        );
      }
    },
    cleanup: async () => {
      const cleanups = await Promise.all([
        runSshCommand(
          ssh,
          ssh.server,
          cleanupCommand(serverPidFile),
          ssh.connectTimeoutMs + 2000,
        ),
        runSshCommand(
          ssh,
          ssh.client,
          cleanupCommand(clientPidFile),
          ssh.connectTimeoutMs + 2000,
        ),
      ]);
      const failedCleanup = cleanups.find(
        (cleanup) => cleanup.timedOut || cleanup.exitCode !== 0,
      );
      if (failedCleanup) {
        throw new Error(failedCleanup.stderr || "远程清理命令未成功完成。");
      }
    },
  });
}

export async function runHandshake(
  config: NativeRuntimeConfig,
  request: HandshakeRequest,
): Promise<HandshakeResult> {
  if (config.status !== "ready" || !config.executablePath) {
    throw new GatewayError(
      503,
      "BACKEND_NOT_READY",
      config.reason ?? "openHiTLS 原生客户端尚未就绪。",
    );
  }

  const id = randomUUID();
  if (config.transport === "ssh") {
    const execution = await runHardwareHandshake(config, request, id);
    return resultFromExecution(config, request, id, execution);
  }

  const execution = await runLocalHandshake(config, request);
  return resultFromExecution(config, request, id, execution);
}
