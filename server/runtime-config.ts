import { existsSync, statSync } from "node:fs";
import path from "node:path";
import type { RuntimeInfo, RuntimeTransport } from "../shared/runtime-contract.js";

export type SshNodeConfig = {
  label: string;
  host: string;
  port: number;
  user: string;
  identityPath: string | null;
  workingDirectory: string;
  executablePath: string;
  didCertificatePath: string | null;
  didKeyPath: string | null;
  fakeDidCertificatePath?: string | null;
  fakeDidKeyPath?: string | null;
  unknownDidCertificatePath?: string | null;
  unknownDidKeyPath?: string | null;
  libraryPath: string | null;
};

export type SshTransportConfig = {
  executablePath: string;
  connectTimeoutMs: number;
  strictHostKeyChecking: "yes" | "accept-new" | "no";
  knownHostsPath: string | null;
  server: SshNodeConfig;
  client: SshNodeConfig;
  indyLedger: { host: string; port: number; genesisPath: string };
};

export type NativeRuntimeConfig = {
  transport: RuntimeTransport;
  status: RuntimeInfo["backend"]["status"];
  reason: string | null;
  executablePath: string | null;
  executableName: string | null;
  workingDirectory: string;
  prefixArgs: string[];
  target: { host: string; port: number };
  didCertificatePath: string | null;
  didKeyPath: string | null;
  indyGenesisPath: string | null;
  managedServer: {
    enabled: boolean;
    executablePath: string | null;
    executableName: string | null;
    workingDirectory: string;
    didCertificatePath: string | null;
    didKeyPath: string | null;
    startupTimeoutMs: number;
  };
  ssh: SshTransportConfig | null;
};

function optionalAbsolutePath(value: string | undefined, cwd: string) {
  if (!value?.trim()) return null;
  return path.resolve(cwd, value.trim());
}

function isFile(filePath: string | null) {
  if (!filePath || !existsSync(filePath)) return false;
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function parsePort(raw: string | undefined, fallback: number) {
  const port = Number(raw ?? fallback);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

function parsePositiveInteger(raw: string | undefined, fallback: number) {
  const value = Number(raw ?? fallback);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function parseBoolean(raw: string | undefined, fallback = false) {
  if (!raw?.trim()) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

function parsePrefixArgs(raw: string | undefined) {
  if (!raw?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}

function parseTransport(raw: string | undefined): RuntimeTransport {
  return raw?.trim().toLowerCase() === "ssh" ? "ssh" : "local";
}

function parseStrictHostKeyChecking(raw: string | undefined) {
  const value = raw?.trim().toLowerCase();
  return value === "accept-new" || value === "no" ? value : "yes";
}

function commandPath(raw: string | undefined, cwd: string) {
  const value = raw?.trim() || "ssh";
  return path.isAbsolute(value) || /[\\/]/u.test(value) ? path.resolve(cwd, value) : value;
}

function remotePath(raw: string | undefined, fallback: string) {
  return raw?.trim() || fallback;
}

function validRemoteToken(value: string) {
  return Boolean(value) && !/[\r\n\0]/u.test(value);
}

function validHost(value: string) {
  return validRemoteToken(value) && !/^-/u.test(value) && !/\s/u.test(value);
}

function validUser(value: string) {
  return /^[a-z_][a-z0-9_-]*[$]?$/iu.test(value);
}

function commandNeedsLocalFile(command: string) {
  return path.isAbsolute(command) || /[\\/]/u.test(command);
}

function remoteName(filePath: string | null) {
  return filePath ? path.posix.basename(filePath.replace(/\\/gu, "/")) : null;
}

export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): NativeRuntimeConfig {
  const transport = parseTransport(env.HITLS_TRANSPORT);
  const executablePath = optionalAbsolutePath(env.HITLS_CLIENT_BIN, cwd);
  const workingDirectory = optionalAbsolutePath(env.HITLS_CLIENT_WORKDIR, cwd) ?? cwd;
  const didCertificatePath = optionalAbsolutePath(env.HITLS_DID_CERT, cwd);
  const didKeyPath = optionalAbsolutePath(env.HITLS_DID_KEY, cwd);
  const indyGenesisPath = optionalAbsolutePath(env.INDY_GENESIS_PATH, cwd);
  const managedServerEnabled = parseBoolean(env.HITLS_MANAGE_SERVER);
  const serverExecutablePath = optionalAbsolutePath(env.HITLS_SERVER_BIN, cwd);
  const serverWorkingDirectory =
    optionalAbsolutePath(env.HITLS_SERVER_WORKDIR, cwd) ?? workingDirectory;
  const serverDidCertificatePath = optionalAbsolutePath(env.HITLS_SERVER_DID_CERT, cwd);
  const serverDidKeyPath = optionalAbsolutePath(env.HITLS_SERVER_DID_KEY, cwd);
  const startupTimeoutMs = parsePositiveInteger(env.HITLS_SERVER_STARTUP_TIMEOUT_MS, 5000);

  const sshExecutablePath = commandPath(env.HITLS_SSH_BIN, cwd);
  const serverHost = env.HITLS_SERVER_SSH_HOST?.trim() || "192.168.50.21";
  const clientHost = env.HITLS_CLIENT_SSH_HOST?.trim() || "192.168.50.22";
  const sharedLibraryPath =
    env.HITLS_REMOTE_LIBRARY_PATH?.trim() ||
    "/root/openhitls-main/build:/root/indy-vdr/target/release";
  const remoteGenesisPath = remotePath(
    env.HITLS_REMOTE_GENESIS_PATH,
    "/root/openhitls-main/testcode/demo-did/pool_transactions_genesis",
  );
  const ssh: SshTransportConfig = {
    executablePath: sshExecutablePath,
    connectTimeoutMs: parsePositiveInteger(env.HITLS_SSH_CONNECT_TIMEOUT_MS, 5000),
    strictHostKeyChecking: parseStrictHostKeyChecking(env.HITLS_SSH_STRICT_HOST_KEY_CHECKING),
    knownHostsPath: optionalAbsolutePath(env.HITLS_SSH_KNOWN_HOSTS, cwd),
    server: {
      label: "板卡21 · TLS Server",
      host: serverHost,
      port: parsePort(env.HITLS_SERVER_SSH_PORT, 22),
      user: env.HITLS_SERVER_SSH_USER?.trim() || "root",
      identityPath: optionalAbsolutePath(env.HITLS_SERVER_SSH_IDENTITY, cwd),
      workingDirectory: remotePath(
        env.HITLS_SERVER_WORKDIR,
        "/root/openhitls-main/testcode/demo-did/build",
      ),
      executablePath: remotePath(env.HITLS_SERVER_BIN, "./tls_server"),
      didCertificatePath: remotePath(
        env.HITLS_SERVER_DID_CERT,
        "./certs/server_indy_cert.der",
      ),
      didKeyPath: remotePath(env.HITLS_SERVER_DID_KEY, "./certs/server_indy_key.der"),
      fakeDidCertificatePath: remotePath(
        env.HITLS_SERVER_FAKE_DID_CERT,
        "./certs/fake_server_indy_cert.der",
      ),
      fakeDidKeyPath: remotePath(
        env.HITLS_SERVER_FAKE_DID_KEY,
        "./certs/fake_server_indy_key.der",
      ),
      unknownDidCertificatePath: remotePath(
        env.HITLS_SERVER_UNKNOWN_DID_CERT,
        "./certs/unknown_server_cert.der",
      ),
      unknownDidKeyPath: remotePath(
        env.HITLS_SERVER_UNKNOWN_DID_KEY,
        "./certs/unknown_server_key.der",
      ),
      libraryPath: env.HITLS_SERVER_LIBRARY_PATH?.trim() || sharedLibraryPath,
    },
    client: {
      label: "板卡22 · TLS Client",
      host: clientHost,
      port: parsePort(env.HITLS_CLIENT_SSH_PORT, 22),
      user: env.HITLS_CLIENT_SSH_USER?.trim() || "root",
      identityPath: optionalAbsolutePath(env.HITLS_CLIENT_SSH_IDENTITY, cwd),
      workingDirectory: remotePath(
        env.HITLS_CLIENT_WORKDIR,
        "/root/openhitls-main/testcode/demo-did/build",
      ),
      executablePath: remotePath(env.HITLS_CLIENT_BIN, "./tls_client"),
      didCertificatePath: remotePath(env.HITLS_DID_CERT, "../client_did_cert.der"),
      didKeyPath: remotePath(env.HITLS_DID_KEY, "../client_did_key.der"),
      libraryPath: env.HITLS_CLIENT_LIBRARY_PATH?.trim() || sharedLibraryPath,
    },
    indyLedger: {
      host: env.HITLS_INDY_HOST?.trim() || "192.168.50.100",
      port: parsePort(env.HITLS_INDY_PORT, 9702),
      genesisPath: remoteGenesisPath,
    },
  };

  let status: NativeRuntimeConfig["status"] = "ready";
  let reason: string | null = null;
  if (transport === "ssh") {
    const invalidNode = [ssh.server, ssh.client].find(
      (node) =>
        !validHost(node.host) ||
        !validUser(node.user) ||
        !validRemoteToken(node.workingDirectory) ||
        !validRemoteToken(node.executablePath),
    );
    const missingIdentity = [ssh.server.identityPath, ssh.client.identityPath].find(
      (identityPath) => identityPath && !isFile(identityPath),
    );
    if (invalidNode || !validHost(ssh.indyLedger.host)) {
      status = "unavailable";
      reason = "SSH 板卡配置包含无效的主机、用户或远程路径。";
    } else if (commandNeedsLocalFile(ssh.executablePath) && !isFile(ssh.executablePath)) {
      status = "unavailable";
      reason = "HITLS_SSH_BIN 指向的 ssh 可执行文件不存在。";
    } else if (missingIdentity) {
      status = "unavailable";
      reason = "配置的 SSH 私钥文件不存在；也可以不填私钥并使用 ssh-agent。";
    }
  } else if (!executablePath) {
    status = "unconfigured";
    reason = "尚未配置 HITLS_CLIENT_BIN；Gateway 在线，但不会伪造原生握手结果。";
  } else if (!isFile(executablePath)) {
    status = "unavailable";
    reason = "HITLS_CLIENT_BIN 指向的文件不存在或不是普通文件。";
  } else if (!existsSync(workingDirectory)) {
    status = "unavailable";
    reason = "HITLS_CLIENT_WORKDIR 不存在。";
  } else if (managedServerEnabled && !isFile(serverExecutablePath)) {
    status = "unavailable";
    reason = "已启用 HITLS_MANAGE_SERVER，但 HITLS_SERVER_BIN 不存在或不是普通文件。";
  } else if (managedServerEnabled && !existsSync(serverWorkingDirectory)) {
    status = "unavailable";
    reason = "HITLS_SERVER_WORKDIR 不存在。";
  }

  return {
    transport,
    status,
    reason,
    executablePath: transport === "ssh" ? ssh.client.executablePath : executablePath,
    executableName:
      transport === "ssh"
        ? remoteName(ssh.client.executablePath)
        : executablePath
          ? path.basename(executablePath)
          : null,
    workingDirectory,
    prefixArgs: parsePrefixArgs(env.HITLS_CLIENT_PREFIX_ARGS),
    target: {
      host:
        transport === "ssh"
          ? env.HITLS_TLS_TARGET?.trim() || serverHost
          : env.HITLS_FIXED_HOST?.trim() || "127.0.0.1",
      port:
        transport === "ssh"
          ? parsePort(env.HITLS_TLS_PORT, 12345)
          : parsePort(env.HITLS_FIXED_PORT, 12346),
    },
    didCertificatePath,
    didKeyPath,
    indyGenesisPath,
    managedServer: {
      enabled: transport === "ssh" ? true : managedServerEnabled,
      executablePath:
        transport === "ssh" ? ssh.server.executablePath : serverExecutablePath,
      executableName:
        transport === "ssh"
          ? remoteName(ssh.server.executablePath)
          : serverExecutablePath
            ? path.basename(serverExecutablePath)
            : null,
      workingDirectory: serverWorkingDirectory,
      didCertificatePath: serverDidCertificatePath,
      didKeyPath: serverDidKeyPath,
      startupTimeoutMs,
    },
    ssh: transport === "ssh" ? ssh : null,
  };
}

export function toPublicRuntimeInfo(
  config: NativeRuntimeConfig,
  startedAt: Date,
  now = new Date(),
): RuntimeInfo {
  const ssh = config.ssh;
  const isSsh = config.transport === "ssh" && ssh !== null;
  const clientDidCertificate = isSsh ? ssh.client.didCertificatePath : config.didCertificatePath;
  const clientDidKey = isSsh ? ssh.client.didKeyPath : config.didKeyPath;
  const serverDidCertificate = isSsh
    ? ssh.server.didCertificatePath
    : config.managedServer.didCertificatePath;
  const serverDidKey = isSsh ? ssh.server.didKeyPath : config.managedServer.didKeyPath;
  const clientProfileReady = isSsh
    ? Boolean(clientDidCertificate && clientDidKey)
    : isFile(clientDidCertificate) && isFile(clientDidKey);
  const serverProfileReady = isSsh
    ? Boolean(serverDidCertificate && serverDidKey)
    : isFile(serverDidCertificate) && isFile(serverDidKey);

  return {
    gateway: {
      status: "online",
      version: "1.1.0",
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000)),
    },
    backend: {
      status: config.status,
      reason: config.reason,
      transport: config.transport,
      adapter: isSsh ? "openhitls-hardware-ssh" : "openhitls-unified-client",
      executableName: config.executableName,
      target: { ...config.target, configurable: false },
      capabilities: {
        didTls: true,
        mutualTls: true,
        autoMode: !isSsh,
        fallbackMode: {
          configurable: false,
          effectiveValueInAutoMode: isSsh ? null : true,
        },
        verifyOnChain: { configurable: false, effectiveValue: true },
        structuredNativeOutput: false,
      },
      certificateProfiles: {
        did: {
          configured: clientProfileReady,
          certificateName: remoteName(clientDidCertificate),
          keyName: remoteName(clientDidKey),
        },
        serverDid: {
          configured: serverProfileReady,
          certificateName: remoteName(serverDidCertificate),
          keyName: remoteName(serverDidKey),
        },
        traditionalBuiltin: { configured: true },
      },
      server: {
        mode: isSsh
          ? "ssh-managed"
          : config.managedServer.enabled
            ? "managed"
            : "external",
        configured: isSsh
          ? Boolean(ssh.server.executablePath)
          : config.managedServer.enabled
            ? isFile(config.managedServer.executablePath)
            : true,
        executableName: config.managedServer.executableName,
      },
      indyLedger: {
        configured: isSsh ? Boolean(ssh.indyLedger.genesisPath) : isFile(config.indyGenesisPath),
        genesisName: isSsh
          ? remoteName(ssh.indyLedger.genesisPath)
          : remoteName(config.indyGenesisPath),
        host: isSsh ? ssh.indyLedger.host : null,
        port: isSsh ? ssh.indyLedger.port : null,
      },
      hardware: isSsh
        ? {
            serverBoard: {
              label: ssh.server.label,
              host: ssh.server.host,
              port: ssh.server.port,
              user: ssh.server.user,
              executableName: remoteName(ssh.server.executablePath) ?? ssh.server.executablePath,
            },
            clientBoard: {
              label: ssh.client.label,
              host: ssh.client.host,
              port: ssh.client.port,
              user: ssh.client.user,
              executableName: remoteName(ssh.client.executablePath) ?? ssh.client.executablePath,
            },
          }
        : null,
    },
  };
}
