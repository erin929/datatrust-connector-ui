import { existsSync, statSync } from "node:fs";
import path from "node:path";
import type { RuntimeInfo } from "../shared/runtime-contract.js";

export type NativeRuntimeConfig = {
  status: RuntimeInfo["backend"]["status"];
  reason: string | null;
  executablePath: string | null;
  executableName: string | null;
  workingDirectory: string;
  prefixArgs: string[];
  target: { host: string; port: number };
  didCertificatePath: string | null;
  didKeyPath: string | null;
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

function parsePort(raw: string | undefined) {
  const port = Number(raw ?? "12346");
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : 12346;
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

export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): NativeRuntimeConfig {
  const executablePath = optionalAbsolutePath(env.HITLS_CLIENT_BIN, cwd);
  const workingDirectory = optionalAbsolutePath(env.HITLS_CLIENT_WORKDIR, cwd) ?? cwd;
  const didCertificatePath = optionalAbsolutePath(env.HITLS_DID_CERT, cwd);
  const didKeyPath = optionalAbsolutePath(env.HITLS_DID_KEY, cwd);

  let status: NativeRuntimeConfig["status"] = "ready";
  let reason: string | null = null;
  if (!executablePath) {
    status = "unconfigured";
    reason = "尚未配置 HITLS_CLIENT_BIN；Gateway 在线，但不会伪造原生握手结果。";
  } else if (!isFile(executablePath)) {
    status = "unavailable";
    reason = "HITLS_CLIENT_BIN 指向的文件不存在或不是普通文件。";
  } else if (!existsSync(workingDirectory)) {
    status = "unavailable";
    reason = "HITLS_CLIENT_WORKDIR 不存在。";
  }

  return {
    status,
    reason,
    executablePath,
    executableName: executablePath ? path.basename(executablePath) : null,
    workingDirectory,
    prefixArgs: parsePrefixArgs(env.HITLS_CLIENT_PREFIX_ARGS),
    target: {
      host: env.HITLS_FIXED_HOST?.trim() || "127.0.0.1",
      port: parsePort(env.HITLS_FIXED_PORT),
    },
    didCertificatePath,
    didKeyPath,
  };
}

export function toPublicRuntimeInfo(
  config: NativeRuntimeConfig,
  startedAt: Date,
  now = new Date(),
): RuntimeInfo {
  return {
    gateway: {
      status: "online",
      version: "1.0.0",
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000)),
    },
    backend: {
      status: config.status,
      reason: config.reason,
      adapter: "openhitls-unified-client",
      executableName: config.executableName,
      target: { ...config.target, configurable: false },
      capabilities: {
        didTls: true,
        mutualTls: true,
        autoMode: true,
        fallbackMode: { configurable: false, effectiveValueInAutoMode: true },
        verifyOnChain: { configurable: false, effectiveValue: true },
        structuredNativeOutput: false,
      },
      certificateProfiles: {
        did: {
          configured: isFile(config.didCertificatePath) && isFile(config.didKeyPath),
          certificateName: config.didCertificatePath ? path.basename(config.didCertificatePath) : null,
          keyName: config.didKeyPath ? path.basename(config.didKeyPath) : null,
        },
        traditionalBuiltin: { configured: true },
      },
    },
  };
}
