import net from "node:net";
import type {
  RuntimePreflight,
  RuntimePreflightCheck,
} from "../shared/runtime-contract.js";
import type { NativeRuntimeConfig, SshNodeConfig } from "./runtime-config.js";
import { quotePosixShell, runSshCommand } from "./ssh-transport.js";

function conciseDetail(value: string) {
  return value.replace(/\s+/gu, " ").trim().slice(0, 400);
}

function buildNodePreflightCommand(
  node: SshNodeConfig,
  genesisPath: string,
  includeDidProfile: boolean,
) {
  const lddCommand = node.libraryPath
    ? `env ${quotePosixShell(`LD_LIBRARY_PATH=${node.libraryPath}`)} ldd ${quotePosixShell(node.executablePath)}`
    : `ldd ${quotePosixShell(node.executablePath)}`;
  const commands = [
    `if ! cd ${quotePosixShell(node.workingDirectory)}; then printf 'WORKDIR_MISSING'; exit 31; fi`,
    `if ! test -x ${quotePosixShell(node.executablePath)}; then printf 'EXECUTABLE_MISSING'; exit 32; fi`,
    `if ! test -r ${quotePosixShell(genesisPath)}; then printf 'GENESIS_MISSING'; exit 33; fi`,
  ];
  if (includeDidProfile && node.didCertificatePath && node.didKeyPath) {
    commands.push(
      `if ! test -r ${quotePosixShell(node.didCertificatePath)}; then printf 'DID_CERT_MISSING'; exit 34; fi`,
      `if ! test -r ${quotePosixShell(node.didKeyPath)}; then printf 'DID_KEY_MISSING'; exit 35; fi`,
    );
  }
  commands.push(
    `if command -v ldd >/dev/null 2>&1; then missing=$(${lddCommand} 2>&1 | grep 'not found' || true); if test -n "$missing"; then printf 'DEPENDENCY_MISSING: %s' "$missing"; exit 36; fi; fi`,
    "printf 'READY'",
  );
  return commands.join("; ");
}

async function checkSshNode(
  config: NativeRuntimeConfig,
  node: SshNodeConfig,
  id: "server_board" | "client_board",
): Promise<RuntimePreflightCheck> {
  const startedAt = Date.now();
  const ssh = config.ssh!;
  try {
    const result = await runSshCommand(
      ssh,
      node,
      buildNodePreflightCommand(node, ssh.indyLedger.genesisPath, true),
      ssh.connectTimeoutMs + 5000,
    );
    const latencyMs = Date.now() - startedAt;
    if (result.timedOut || result.exitCode === 255) {
      return {
        id,
        label: node.label,
        host: `${node.host}:${node.port}`,
        status: "unreachable",
        latencyMs,
        detail: result.timedOut
          ? "SSH 连接超时。"
          : conciseDetail(result.stderr) || "SSH 无法连接或认证失败。",
      };
    }
    if (result.exitCode !== 0) {
      return {
        id,
        label: node.label,
        host: `${node.host}:${node.port}`,
        status: "misconfigured",
        latencyMs,
        detail:
          conciseDetail(result.stdout || result.stderr) ||
          `远程环境检查失败（exit ${result.exitCode ?? "unknown"}）。`,
      };
    }
    return {
      id,
      label: node.label,
      host: `${node.host}:${node.port}`,
      status: "ready",
      latencyMs,
      detail: "SSH、可执行文件、DID 证书、Genesis 与动态库检查通过。",
    };
  } catch (error) {
    return {
      id,
      label: node.label,
      host: `${node.host}:${node.port}`,
      status: "unreachable",
      latencyMs: Date.now() - startedAt,
      detail: error instanceof Error ? error.message : "无法启动本机 SSH 客户端。",
    };
  }
}

function checkTcp(host: string, port: number, timeoutMs: number): Promise<RuntimePreflightCheck> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (status: RuntimePreflightCheck["status"], detail: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        id: "indy_ledger",
        label: "Indy Ledger",
        host: `${host}:${port}`,
        status,
        latencyMs: Date.now() - startedAt,
        detail,
      });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish("ready", "Indy 客户端端口可连接；链上查询仍以握手日志为准。"));
    socket.once("timeout", () => finish("unreachable", "Indy 客户端端口连接超时。"));
    socket.once("error", (error) => finish("unreachable", conciseDetail(error.message)));
  });
}

function overallStatus(checks: readonly RuntimePreflightCheck[]): RuntimePreflight["status"] {
  if (checks.every((check) => check.status === "ready")) return "ready";
  if (checks.some((check) => check.status === "unreachable")) return "unavailable";
  return "degraded";
}

export async function runPreflight(config: NativeRuntimeConfig): Promise<RuntimePreflight> {
  if (config.transport === "local" || !config.ssh) {
    const checks: RuntimePreflightCheck[] = [
      {
        id: "local_backend",
        label: "本机 openHiTLS",
        host: config.target.host,
        status: config.status === "ready" ? "ready" : "misconfigured",
        latencyMs: 0,
        detail: config.reason ?? "本机可执行文件配置检查通过。",
      },
    ];
    return {
      transport: "local",
      checkedAt: new Date().toISOString(),
      status: overallStatus(checks),
      checks,
    };
  }

  const ssh = config.ssh;
  const [serverBoard, clientBoard, indyLedger] = await Promise.all([
    checkSshNode(config, ssh.server, "server_board"),
    checkSshNode(config, ssh.client, "client_board"),
    checkTcp(ssh.indyLedger.host, ssh.indyLedger.port, ssh.connectTimeoutMs),
  ]);
  const checks = [serverBoard, clientBoard, indyLedger];
  return {
    transport: "ssh",
    checkedAt: new Date().toISOString(),
    status: overallStatus(checks),
    checks,
  };
}
