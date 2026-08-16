import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { Readable } from "node:stream";
import type {
  HandshakeLogEntry,
  HandshakeRequest,
  HandshakeResult,
} from "../shared/runtime-contract.js";
import { GatewayError } from "./gateway-error.js";
import { parseNativeOutcome } from "./handshake-parser.js";
import type { NativeRuntimeConfig } from "./runtime-config.js";

const MAX_OUTPUT_BYTES = 1024 * 1024;

function didProfileReady(config: NativeRuntimeConfig) {
  return Boolean(
    config.didCertificatePath &&
      config.didKeyPath &&
      existsSync(config.didCertificatePath) &&
      existsSync(config.didKeyPath),
  );
}

export function buildNativeArgs(config: NativeRuntimeConfig, request: HandshakeRequest) {
  const args = [...config.prefixArgs, "--auth-mode", request.authMode];
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

  const args = buildNativeArgs(config, request);
  const id = randomUUID();
  const started = new Date();
  const logs: HandshakeLogEntry[] = [];
  let sequence = 0;
  let outputBytes = 0;
  let timedOut = false;

  const processResult = await new Promise<{ exitCode: number | null; signal: string | null }>(
    (resolve, reject) => {
      const child = spawn(config.executablePath!, args, {
        cwd: config.workingDirectory,
        env: process.env,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const pushLine = (stream: HandshakeLogEntry["stream"], rawLine: string) => {
        const message = rawLine.trimEnd();
        if (!message) return;
        outputBytes += Buffer.byteLength(message, "utf8");
        if (outputBytes > MAX_OUTPUT_BYTES) {
          child.kill();
          return;
        }
        logs.push({ sequence: sequence++, stream, level: logLevel(message), message });
      };
      const flushStdout = attachLineCollector(child.stdout, "stdout", pushLine);
      const flushStderr = attachLineCollector(child.stderr, "stderr", pushLine);
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, request.timeoutMs);

      child.once("error", (error) => {
        clearTimeout(timeout);
        reject(
          new GatewayError(502, "PROCESS_SPAWN_FAILED", "无法启动 openHiTLS 原生客户端。", {
            cause: error.message,
          }),
        );
      });
      child.once("close", (exitCode, signal) => {
        clearTimeout(timeout);
        flushStdout();
        flushStderr();
        if (outputBytes > MAX_OUTPUT_BYTES) {
          logs.push({
            sequence: sequence++,
            stream: "stderr",
            level: "error",
            message: "Gateway 已终止原生进程：输出超过 1 MiB 安全上限。",
          });
        }
        resolve({ exitCode, signal });
      });
    },
  );

  const finished = new Date();
  const parsed = parseNativeOutcome(logs, request.authMode, processResult.exitCode, timedOut);
  const localCertificateMode = !request.mutualTls
    ? "UNKNOWN"
    : request.authMode === "traditional"
      ? "NORMAL"
      : "DID";
  const authModeValue = request.authMode === "traditional" ? 1 : request.authMode === "did" ? 2 : 3;

  return {
    id,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    status: parsed.status,
    request,
    process: processResult,
    connection: {
      target: config.target,
      completed: parsed.completed,
      durationMs: finished.getTime() - started.getTime(),
      nativeHandshakeMs: parsed.nativeHandshakeMs,
      hitlsCode: parsed.hitlsCode,
      tlsAlert: parsed.tlsAlert,
      tlsVersion: null,
    },
    negotiation: {
      localCertificateMode,
      peerCertificateMode: "UNKNOWN",
      clientDidAuthMode: authModeValue,
      serverDidAuthMode: null,
      fallbackMode: request.authMode === "auto",
    },
    didVerification: parsed.didVerification,
    logs,
  };
}
