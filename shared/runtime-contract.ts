export const AUTH_MODES = ["traditional", "did", "auto"] as const;

export type AuthMode = (typeof AUTH_MODES)[number];
export type BackendStatus = "ready" | "unconfigured" | "unavailable";
export type RuntimeTransport = "local" | "ssh";
export type CertificateMode = "NORMAL" | "DID" | "UNKNOWN";
export type HandshakeStatus = "succeeded" | "failed" | "timed_out";
export type DidVerificationStatus = "succeeded" | "failed" | "not_run" | "unknown";

export type DidVerifyResultName =
  | "DID_VERIFY_SUCCESS"
  | "DID_VERIFY_CERT_PARSE_FAIL"
  | "DID_VERIFY_DID_NOT_FOUND"
  | "DID_VERIFY_BLOCKCHAIN_FAIL"
  | "DID_VERIFY_PUBKEY_MISMATCH"
  | "DID_VERIFY_CERT_TIME_FAIL"
  | "DID_VERIFY_SIGNATURE_FAIL"
  | "DID_VERIFY_INTERNAL_ERROR";

export type RuntimeNodeInfo = {
  label: string;
  host: string;
  port: number;
  user: string;
  executableName: string;
};

export type RuntimeInfo = {
  gateway: {
    status: "online";
    version: string;
    startedAt: string;
    uptimeSeconds: number;
  };
  backend: {
    status: BackendStatus;
    reason: string | null;
    transport: RuntimeTransport;
    adapter: "openhitls-unified-client" | "openhitls-hardware-ssh";
    executableName: string | null;
    target: { host: string; port: number; configurable: false };
    capabilities: {
      didTls: true;
      mutualTls: true;
      autoMode: boolean;
      fallbackMode: { configurable: false; effectiveValueInAutoMode: boolean | null };
      verifyOnChain: { configurable: false; effectiveValue: true };
      structuredNativeOutput: false;
    };
    certificateProfiles: {
      did: { configured: boolean; certificateName: string | null; keyName: string | null };
      serverDid: { configured: boolean; certificateName: string | null; keyName: string | null };
      traditionalBuiltin: { configured: true };
    };
    server: {
      mode: "managed" | "external" | "ssh-managed";
      configured: boolean;
      executableName: string | null;
    };
    indyLedger: {
      configured: boolean;
      genesisName: string | null;
      host: string | null;
      port: number | null;
    };
    hardware: {
      serverBoard: RuntimeNodeInfo;
      clientBoard: RuntimeNodeInfo;
    } | null;
  };
};

export type RuntimeCheckStatus = "ready" | "unreachable" | "misconfigured" | "not_checked";

export type RuntimePreflightCheck = {
  id: "server_board" | "client_board" | "indy_ledger" | "local_backend";
  label: string;
  host: string;
  status: RuntimeCheckStatus;
  latencyMs: number | null;
  detail: string;
};

export type RuntimePreflight = {
  transport: RuntimeTransport;
  checkedAt: string;
  status: "ready" | "degraded" | "unavailable";
  checks: RuntimePreflightCheck[];
};

export type HandshakeRequest = {
  authMode: AuthMode;
  mutualTls: boolean;
  timeoutMs: number;
};

export type HandshakeLogEntry = {
  sequence: number;
  source: "gateway" | "client" | "server";
  stream: "stdout" | "stderr";
  level: "info" | "warning" | "error";
  message: string;
};

export type DidVerificationResult = {
  status: DidVerificationStatus;
  code: number | null;
  name: DidVerifyResultName | null;
  message: string | null;
  verifyOnChain: boolean;
};

export type NativeProcessResult = {
  exitCode: number | null;
  signal: string | null;
};

export type HandshakeResult = {
  id: string;
  startedAt: string;
  finishedAt: string;
  status: HandshakeStatus;
  request: HandshakeRequest;
  process: NativeProcessResult & {
    client: NativeProcessResult;
    server: NativeProcessResult | null;
  };
  connection: {
    target: { host: string; port: number };
    completed: boolean;
    durationMs: number;
    nativeHandshakeMs: number | null;
    hitlsCode: string | null;
    tlsAlert: string | null;
    tlsVersion: string | null;
  };
  negotiation: {
    localCertificateMode: CertificateMode;
    peerCertificateMode: CertificateMode;
    clientDidAuthMode: number | null;
    serverDidAuthMode: number | null;
    fallbackMode: boolean;
  };
  didVerification: DidVerificationResult;
  logs: HandshakeLogEntry[];
};

export type HandshakeHistoryResponse = {
  items: HandshakeResult[];
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
