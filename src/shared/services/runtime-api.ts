import type {
  ApiErrorBody,
  HandshakeHistoryResponse,
  HandshakeRequest,
  HandshakeResult,
  RuntimeInfo,
  RuntimePreflight,
} from "../../../shared/runtime-contract";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { accept: "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiRequestError(
      0,
      "GATEWAY_OFFLINE",
      "无法连接本地 Connector Gateway，请确认 npm run dev 正在运行。",
    );
  }

  const body = (await response.json().catch(() => null)) as T | ApiErrorBody | null;
  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;
    throw new ApiRequestError(
      response.status,
      errorBody?.error?.code ?? "HTTP_ERROR",
      errorBody?.error?.message ?? `Gateway 返回 HTTP ${response.status}。`,
      errorBody?.error?.details,
    );
  }
  return body as T;
}

export const getRuntime = (url: string) => requestJson<RuntimeInfo>(url);
export const getPreflight = (url: string) => requestJson<RuntimePreflight>(url);
export const getHandshakeHistory = (url: string) => requestJson<HandshakeHistoryResponse>(url);
export const postHandshake = (url: string, { arg }: { arg: HandshakeRequest }) =>
  requestJson<HandshakeResult>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(arg),
  });
