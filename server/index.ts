import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  ApiErrorBody,
  HandshakeHistoryResponse,
  HandshakeRequest,
  HandshakeResult,
  RuntimePreflight,
} from "../shared/runtime-contract.js";
import { AUTH_MODES } from "../shared/runtime-contract.js";
import { loadLocalEnv } from "./env.js";
import { GatewayError } from "./gateway-error.js";
import { runHandshake } from "./handshake-runner.js";
import { runPreflight } from "./preflight.js";
import { loadRuntimeConfig, toPublicRuntimeInfo } from "./runtime-config.js";

loadLocalEnv();

const gatewayStartedAt = new Date();
const runtimeConfig = loadRuntimeConfig();
const history: HandshakeResult[] = [];
let handshakeRunning = false;
let preflightRunning: Promise<RuntimePreflight> | null = null;
let preflightSnapshot: { result: RuntimePreflight; expiresAt: number } | null = null;
const frontendDirectory = path.resolve(process.cwd(), "dist");

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) {
      throw new GatewayError(413, "REQUEST_TOO_LARGE", "请求体不能超过 64 KiB。");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new GatewayError(400, "INVALID_JSON", "请求体不是有效 JSON。");
  }
}

function validateHandshakeRequest(value: unknown): HandshakeRequest {
  if (!value || typeof value !== "object") {
    throw new GatewayError(400, "INVALID_REQUEST", "握手请求必须是 JSON 对象。");
  }
  const candidate = value as Partial<HandshakeRequest>;
  if (!AUTH_MODES.includes(candidate.authMode as HandshakeRequest["authMode"])) {
    throw new GatewayError(400, "INVALID_AUTH_MODE", "authMode 必须是 traditional、did 或 auto。");
  }
  if (typeof candidate.mutualTls !== "boolean") {
    throw new GatewayError(400, "INVALID_MUTUAL_TLS", "mutualTls 必须是布尔值。");
  }
  if (
    !Number.isInteger(candidate.timeoutMs) ||
    (candidate.timeoutMs ?? 0) < 1000 ||
    (candidate.timeoutMs ?? 0) > 120000
  ) {
    throw new GatewayError(400, "INVALID_TIMEOUT", "timeoutMs 必须是 1000 到 120000 之间的整数。");
  }
  return candidate as HandshakeRequest;
}

function sendError(response: ServerResponse, error: unknown) {
  const gatewayError =
    error instanceof GatewayError
      ? error
      : new GatewayError(500, "INTERNAL_ERROR", "Gateway 发生未处理错误。");
  const body: ApiErrorBody = {
    error: {
      code: gatewayError.code,
      message: gatewayError.message,
      details: gatewayError.details,
    },
  };
  sendJson(response, gatewayError.statusCode, body);
}

function getPreflight() {
  if (preflightSnapshot && preflightSnapshot.expiresAt > Date.now()) {
    return Promise.resolve(preflightSnapshot.result);
  }
  if (!preflightRunning) {
    preflightRunning = runPreflight(runtimeConfig)
      .then((result) => {
        preflightSnapshot = { result, expiresAt: Date.now() + 3000 };
        return result;
      })
      .finally(() => {
        preflightRunning = null;
      });
  }
  return preflightRunning;
}

function serveFrontend(request: IncomingMessage, response: ServerResponse, pathname: string) {
  if ((request.method !== "GET" && request.method !== "HEAD") || !existsSync(frontendDirectory)) {
    return false;
  }
  let relativePath: string;
  try {
    relativePath = decodeURIComponent(pathname === "/" ? "index.html" : pathname.slice(1));
  } catch {
    return false;
  }
  let filePath = path.resolve(frontendDirectory, relativePath);
  if (filePath !== frontendDirectory && !filePath.startsWith(`${frontendDirectory}${path.sep}`)) {
    return false;
  }
  try {
    if (!statSync(filePath).isFile()) return false;
  } catch {
    if (path.extname(relativePath)) return false;
    filePath = path.join(frontendDirectory, "index.html");
    if (!existsSync(filePath)) return false;
  }
  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
    "cache-control": extension === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    "x-content-type-options": "nosniff",
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(filePath).pipe(response);
  return true;
}

export const gatewayServer = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://gateway.local");
  try {
    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, { status: "ok", backendStatus: runtimeConfig.status });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/runtime") {
      sendJson(response, 200, toPublicRuntimeInfo(runtimeConfig, gatewayStartedAt));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/preflight") {
      sendJson(response, 200, await getPreflight());
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/handshakes") {
      const body: HandshakeHistoryResponse = { items: history.slice(0, 50) };
      sendJson(response, 200, body);
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/handshakes") {
      if (handshakeRunning) {
        throw new GatewayError(
          409,
          "HANDSHAKE_BUSY",
          "已有一个原生握手正在执行。为保护当前非线程安全的 Indy 集成，Gateway 不并发启动握手。",
        );
      }
      const body = validateHandshakeRequest(await readJsonBody(request));
      handshakeRunning = true;
      try {
        const result = await runHandshake(runtimeConfig, body);
        history.unshift(result);
        if (history.length > 50) history.length = 50;
        sendJson(response, 201, result);
      } finally {
        handshakeRunning = false;
      }
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      throw new GatewayError(404, "NOT_FOUND", "未找到请求的 Gateway API。");
    }
    if (serveFrontend(request, response, url.pathname)) return;
    throw new GatewayError(404, "NOT_FOUND", "未找到请求的 Gateway API 或前端资源。");
  } catch (error) {
    sendError(response, error);
  }
});

const entryFile = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryFile === import.meta.url) {
  const host = process.env.GATEWAY_HOST?.trim() || "127.0.0.1";
  const port = Number(process.env.GATEWAY_PORT ?? "8787");
  gatewayServer.listen(port, host, () => {
    console.log(`[gateway] http://${host}:${port}`);
    console.log(`[gateway] native backend: ${runtimeConfig.status}`);
    if (runtimeConfig.reason) console.log(`[gateway] ${runtimeConfig.reason}`);
  });
}
