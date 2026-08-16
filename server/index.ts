import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import type {
  ApiErrorBody,
  HandshakeHistoryResponse,
  HandshakeRequest,
  HandshakeResult,
} from "../shared/runtime-contract.js";
import { AUTH_MODES } from "../shared/runtime-contract.js";
import { loadLocalEnv } from "./env.js";
import { GatewayError } from "./gateway-error.js";
import { runHandshake } from "./handshake-runner.js";
import { loadRuntimeConfig, toPublicRuntimeInfo } from "./runtime-config.js";

loadLocalEnv();

const gatewayStartedAt = new Date();
const runtimeConfig = loadRuntimeConfig();
const history: HandshakeResult[] = [];
let handshakeRunning = false;

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
    throw new GatewayError(404, "NOT_FOUND", "未找到请求的 Gateway API。");
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
