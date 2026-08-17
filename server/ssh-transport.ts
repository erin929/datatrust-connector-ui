import { spawn, type ChildProcess } from "node:child_process";
import type { SshNodeConfig, SshTransportConfig } from "./runtime-config.js";

const MAX_COMMAND_OUTPUT_BYTES = 256 * 1024;

export type SshCommandResult = {
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export function quotePosixShell(value: string) {
  if (/[\r\n\0]/u.test(value)) {
    throw new Error("远程命令参数不能包含换行符或 NUL。");
  }
  return `'${value.replace(/'/gu, `'\"'\"'`)}'`;
}

export function buildSshArgs(
  transport: SshTransportConfig,
  node: SshNodeConfig,
  remoteCommand: string,
) {
  const connectTimeoutSeconds = Math.max(1, Math.ceil(transport.connectTimeoutMs / 1000));
  const args = [
    "-T",
    "-p",
    String(node.port),
    "-o",
    "BatchMode=yes",
    "-o",
    `ConnectTimeout=${connectTimeoutSeconds}`,
    "-o",
    "ServerAliveInterval=5",
    "-o",
    "ServerAliveCountMax=1",
    "-o",
    `StrictHostKeyChecking=${transport.strictHostKeyChecking}`,
  ];
  if (transport.knownHostsPath) {
    args.push("-o", `UserKnownHostsFile=${transport.knownHostsPath}`);
  }
  if (node.identityPath) args.push("-i", node.identityPath);
  args.push("--", `${node.user}@${node.host}`, remoteCommand);
  return args;
}

export function buildRemoteProgramCommand(
  node: SshNodeConfig,
  args: readonly string[],
  beforeExec?: string,
) {
  const program = [quotePosixShell(node.executablePath), ...args.map(quotePosixShell)].join(" ");
  const withEnvironment = node.libraryPath
    ? `env ${quotePosixShell(`LD_LIBRARY_PATH=${node.libraryPath}`)} ${program}`
    : program;
  const prelude = beforeExec ? `${beforeExec} && ` : "";
  return `cd ${quotePosixShell(node.workingDirectory)} && ${prelude}exec ${withEnvironment}`;
}

export function startSshCommand(
  transport: SshTransportConfig,
  node: SshNodeConfig,
  remoteCommand: string,
): ChildProcess {
  return spawn(transport.executablePath, buildSshArgs(transport, node, remoteCommand), {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function runSshCommand(
  transport: SshTransportConfig,
  node: SshNodeConfig,
  remoteCommand: string,
  timeoutMs: number,
) {
  return new Promise<SshCommandResult>((resolve, reject) => {
    const child = startSshCommand(transport, node, remoteCommand);
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let outputBytes = 0;
    let timedOut = false;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const collect = (target: Buffer[], chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      outputBytes += buffer.length;
      if (outputBytes > MAX_COMMAND_OUTPUT_BYTES) {
        child.kill();
        return;
      }
      target.push(buffer);
    };
    child.stdout!.on("data", (chunk: Buffer) => collect(stdoutChunks, chunk));
    child.stderr!.on("data", (chunk: Buffer) => collect(stderrChunks, chunk));
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({
        exitCode,
        signal,
        stdout: Buffer.concat(stdoutChunks).toString("utf8").trim(),
        stderr: Buffer.concat(stderrChunks).toString("utf8").trim(),
        timedOut,
      });
    });
    timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
  });
}
