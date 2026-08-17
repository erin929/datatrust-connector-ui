import type {
  AuthMode,
  DidVerificationResult,
  DidVerifyResultName,
  HandshakeLogEntry,
  HandshakeStatus,
} from "../shared/runtime-contract.js";

type DidResultDefinition = {
  code: number;
  name: DidVerifyResultName;
  messages: readonly string[];
};

const DID_RESULTS: readonly DidResultDefinition[] = [
  { code: 1, name: "DID_VERIFY_CERT_PARSE_FAIL", messages: ["证书解析失败"] },
  { code: 2, name: "DID_VERIFY_DID_NOT_FOUND", messages: ["证书中未找到DID", "未找到DID"] },
  { code: 3, name: "DID_VERIFY_BLOCKCHAIN_FAIL", messages: ["区块链验证失败", "区块链DID查询失败"] },
  { code: 4, name: "DID_VERIFY_PUBKEY_MISMATCH", messages: ["公钥不匹配"] },
  { code: 5, name: "DID_VERIFY_CERT_TIME_FAIL", messages: ["证书有效期校验失败"] },
  { code: 6, name: "DID_VERIFY_SIGNATURE_FAIL", messages: ["签名验证失败"] },
  { code: 7, name: "DID_VERIFY_INTERNAL_ERROR", messages: ["内部错误"] },
];

export type ParsedNativeOutcome = {
  status: HandshakeStatus;
  completed: boolean;
  nativeHandshakeMs: number | null;
  hitlsCode: string | null;
  tlsAlert: string | null;
  didVerification: DidVerificationResult;
};

function findDidFailure(text: string) {
  return DID_RESULTS.find((definition) =>
    definition.messages.some((message) => text.includes(message)),
  );
}
function findHitlsCode(text: string) {
  const match = text.match(
    /(?:TLS握手失败|HITLS_Connect failed|HITLS_Accept failed)[^\n]*?(0x[0-9a-f]+)/iu,
  );
  return match?.[1]?.toLowerCase() ?? null;
}

function findNativeHandshakeMs(text: string) {
  const match = text.match(/(?:握手完成，用时|握手成功)[:： (]*([0-9]+)\s*ms/iu);
  return match?.[1] ? Number(match[1]) : null;
}

function findTlsAlert(text: string) {
  const namedAlert = text.match(/\b(bad_certificate|certificate_expired|unknown_ca|handshake_failure)\b/iu);
  return namedAlert?.[1]?.toLowerCase() ?? null;
}

function containsLedgerUnavailable(text: string) {
  return /Indy-VDR initialization failed|blockchain verification will be disabled|indy-vdr支持未编译|Indy-VDR未启用|Enable blockchain verification failed/iu.test(
    text,
  );
}

function containsLedgerSuccess(text: string) {
  return /GET_NYM链上查询成功/iu.test(text);
}

export function parseNativeOutcome(
  logs: readonly HandshakeLogEntry[],
  authMode: AuthMode,
  exitCode: number | null,
  timedOut: boolean,
  mutualTls = false,
): ParsedNativeOutcome {
  const text = logs.map((entry) => entry.message).join("\n");
  const clientText = logs
    .filter((entry) => entry.source === "client")
    .map((entry) => entry.message)
    .join("\n");
  const verificationLogs = logs.filter(
    (entry) => entry.source === "client" || (mutualTls && entry.source === "server"),
  );
  const verificationText = verificationLogs.map((entry) => entry.message).join("\n");
  const nativeHandshakeMs = findNativeHandshakeMs(clientText) ?? findNativeHandshakeMs(text);
  const completed = !timedOut && exitCode === 0 && nativeHandshakeMs !== null;
  const status: HandshakeStatus = timedOut ? "timed_out" : completed ? "succeeded" : "failed";
  const didWasRequested = authMode !== "traditional";
  const didFailure = didWasRequested ? findDidFailure(verificationText) : undefined;
  const ledgerUnavailable = didWasRequested && containsLedgerUnavailable(verificationText);
  const verifierSources = mutualTls ? (["client", "server"] as const) : (["client"] as const);
  const ledgerSuccess =
    didWasRequested &&
    verifierSources.every((source) =>
      containsLedgerSuccess(
        logs
          .filter((entry) => entry.source === source)
          .map((entry) => entry.message)
          .join("\n"),
      ),
    );

  let didVerification: DidVerificationResult;
  if (!didWasRequested) {
    didVerification = {
      status: "not_run",
      code: null,
      name: null,
      message: "传统 TLS 模式未执行 DID 验证。",
      verifyOnChain: false,
    };
  } else if (ledgerUnavailable) {
    didVerification = {
      status: "failed",
      code: 3,
      name: "DID_VERIFY_BLOCKCHAIN_FAIL",
      message: "TLS 进程完成，但验证端未启用 Indy-VDR，不能认定为链上 DID 验证成功。",
      verifyOnChain: false,
    };
  } else if (didFailure) {
    didVerification = {
      status: "failed",
      code: didFailure.code,
      name: didFailure.name,
      message:
        didFailure.messages.find((message) => verificationText.includes(message)) ?? didFailure.name,
      verifyOnChain: true,
    };
  } else if (completed && ledgerSuccess) {
    didVerification = {
      status: "succeeded",
      code: 0,
      name: "DID_VERIFY_SUCCESS",
      message: mutualTls
        ? "客户端和服务端均输出 GET_NYM 链上查询成功证据。"
        : "客户端输出 GET_NYM 链上查询成功证据。",
      verifyOnChain: true,
    };
  } else {
    didVerification = {
      status: "unknown",
      code: null,
      name: null,
      message: completed
        ? "TLS 握手成功，但原生日志没有 GET_NYM 链上查询成功证据。"
        : "原生客户端未输出可识别的 DID 详细结果。",
      verifyOnChain: true,
    };
  }

  return {
    status,
    completed,
    nativeHandshakeMs,
    hitlsCode: findHitlsCode(text),
    tlsAlert: findTlsAlert(text),
    didVerification,
  };
}
