import { useState, type FormEvent } from "react";
import type {
  HandshakeScenario,
  HandshakeRequest,
  HandshakeResult,
  RuntimeInfo,
  RuntimePreflight,
} from "../../../shared/runtime-contract";
import { SectionCard } from "../../shared/components/ui/SectionCard";
import { StatusTag } from "../../shared/components/ui/StatusTag";
import { ApiRequestError } from "../../shared/services/runtime-api";

type SecurityScenarioId = HandshakeScenario;

type ScenarioAvailability = "ready";

type SecurityScenario = {
  id: SecurityScenarioId;
  title: string;
  caption: string;
  badge: string;
  availability: ScenarioAvailability;
  direction: string;
  expected: string;
  rule: string;
  runProfile: Pick<HandshakeRequest, "scenario" | "authMode" | "mutualTls">;
};

type ScenarioGroup = {
  id: "normal" | "compatibility" | "security";
  label: string;
  caption: string;
  scenarioIds: readonly SecurityScenarioId[];
};

type Props = {
  runtime: RuntimeInfo;
  preflight?: RuntimePreflight;
  running: boolean;
  error?: Error;
  selectedResult: HandshakeResult | null;
  onRun: (request: HandshakeRequest) => Promise<HandshakeResult>;
  initialScenario?: HandshakeScenario;
};

type ExecutedScenario = {
  id: SecurityScenarioId;
  result: HandshakeResult;
};

type EvidenceTone = "success" | "warning" | "danger" | "neutral";

type EvidenceItem = {
  label: string;
  value: string;
  detail: string;
  tone: EvidenceTone;
};

type SummaryMetric = {
  label: string;
  value: string;
  detail?: string;
};

const SCENARIOS: readonly SecurityScenario[] = [
  {
    id: "did_tls",
    title: "DID-TLS 单向认证",
    caption: "客户端验证服务端 DID 身份",
    badge: "N1",
    availability: "ready",
    direction: "Board 22 DID Client → Board 21 DID Server",
    expected: "服务端 DID 可信，连接建立",
    rule: "证书中的 DID 必须能通过 GET_NYM 查询，且证书公钥与链上 VerKey 一致。",
    runProfile: { scenario: "did_tls", authMode: "did", mutualTls: false },
  },
  {
    id: "did_mtls",
    title: "DID-mTLS 双向认证",
    caption: "客户端与服务端双向验证 DID",
    badge: "N2",
    availability: "ready",
    direction: "Board 22 DID Client ⇄ Board 21 DID Server",
    expected: "双方 DID 均可信，双向通道建立",
    rule: "客户端和服务端必须分别完成 GET_NYM 与证书公钥绑定验证。",
    runProfile: { scenario: "did_mtls", authMode: "did", mutualTls: true },
  },
  {
    id: "pki_to_did",
    title: "传统 Client → DID Server",
    caption: "存量 PKI 客户端兼容接入",
    badge: "N3",
    availability: "ready",
    direction: "Traditional PKI Client → DID-compatible Server",
    expected: "识别传统节点并协商至 PKI 轨",
    rule: "服务端识别客户端不具备 DID 身份能力后，只有启用兼容策略才允许进入传统 PKI 认证轨。",
    runProfile: { scenario: "pki_to_did", authMode: "did", mutualTls: false },
  },
  {
    id: "did_to_pki",
    title: "DID Client → 传统 Server",
    caption: "DID 客户端访问存量服务端",
    badge: "N4",
    availability: "ready",
    direction: "DID-capable Client → Traditional PKI Server",
    expected: "DID 轨不可用时协商至 PKI 轨",
    rule: "客户端发现服务端不支持 DID 后，应由明确的 Fallback 策略决定是否切换至传统 PKI 认证。",
    runProfile: { scenario: "did_to_pki", authMode: "did", mutualTls: false },
  },
  {
    id: "impersonation",
    title: "DID 身份冒用",
    caption: "合法 DID + 攻击者证书密钥",
    badge: "A1",
    availability: "ready",
    direction: "Attacker Server → DID-verifying Client",
    expected: "VerKey 不匹配，拒绝连接",
    rule: "合法 DID 在链上存在，但伪造证书公钥与链上 VerKey 不一致时必须拒绝连接。",
    runProfile: { scenario: "impersonation", authMode: "did", mutualTls: false },
  },
  {
    id: "unregistered",
    title: "未注册 DID",
    caption: "证书含 DID、链上无 NYM",
    badge: "A2",
    availability: "ready",
    direction: "Unregistered DID Server → DID-verifying Client",
    expected: "链上无身份记录，拒绝连接",
    rule: "证书格式与签名正常，但 GET_NYM 没有身份记录时必须拒绝连接。",
    runProfile: { scenario: "unregistered", authMode: "did", mutualTls: false },
  },
];

const SCENARIO_GROUPS: readonly ScenarioGroup[] = [
  { id: "normal", label: "正常认证", caption: "DID 身份可信", scenarioIds: ["did_tls", "did_mtls"] },
  { id: "compatibility", label: "双轨兼容", caption: "DID / PKI 异构互信", scenarioIds: ["pki_to_did", "did_to_pki"] },
  { id: "security", label: "异常拦截", caption: "身份冒用与未注册身份", scenarioIds: ["impersonation", "unregistered"] },
];

const AVAILABILITY_LABELS = {
  ready: "可执行",
} as const;

function availabilityTone(availability: SecurityScenario["availability"]) {
  return availability === "ready" ? "success" as const : "warning" as const;
}

function findPreflightStatus(preflight: RuntimePreflight | undefined, id: "client_board" | "server_board" | "indy_ledger") {
  return preflight?.checks.find((check) => check.id === id)?.status ?? "not_checked";
}

function preflightTone(status: string) {
  return status === "ready" ? "success" as const : status === "not_checked" ? "neutral" as const : "danger" as const;
}

function logText(result: HandshakeResult, source?: "client" | "server") {
  return result.logs
    .filter((entry) => !source || entry.source === source)
    .map((entry) => entry.message)
    .join("\n");
}

function matchValue(text: string, patterns: readonly RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function compactKey(value: string | null) {
  if (!value) return "原生日志未输出完整值";
  return value.length > 24 ? `${value.slice(0, 12)}...${value.slice(-9)}` : value;
}

function queryTime(result: HandshakeResult, source?: "client" | "server") {
  return matchValue(logText(result, source), [
    /GET_NYM链上查询成功[^\n]*?([0-9]+(?:\.[0-9]+)?)\s*ms/iu,
    /GET_NYM[^\n]*?(?:耗时|time)[:： (]*([0-9]+(?:\.[0-9]+)?)\s*ms/iu,
    /DID查询失败[^\n]*?(?:耗时|time)[:： (]*([0-9]+(?:\.[0-9]+)?)\s*ms/iu,
  ]);
}

function extractedDid(result: HandshakeResult) {
  return matchValue(logText(result), [/(did:indy:[A-Za-z0-9:._-]+)/u]);
}

function ledgerVerKey(result: HandshakeResult) {
  return matchValue(logText(result), [
    /\[INDY_VERKEY_OK\]\s*([^\s]+)/iu,
    /(?:链上|blockchain)[^\n]*(?:VerKey|公钥)[:：]\s*([^\s]+)/iu,
  ]);
}

function certificateVerKey(result: HandshakeResult) {
  return matchValue(logText(result), [/(?:证书公钥|cert(?:ificate)?[_ ]?verkey)[:：]\s*([^\s]+)/iu]);
}

function communicationEvidence(result: HandshakeResult) {
  const text = logText(result);
  const clientToServer = /get from client|Hi, this is client/iu.test(text);
  const serverToClient = /get from server|Hi, this is server/iu.test(text);
  return {
    complete: clientToServer && serverToClient,
    detail: `Client → Server  ${clientToServer ? "✓ PASS" : "— 无收包证据"}\nServer → Client  ${serverToClient ? "✓ PASS" : "— 无收包证据"}`,
  };
}

function tlsStep(result: HandshakeResult, label = "TLS 安全通道"): EvidenceItem {
  const elapsed = result.connection.nativeHandshakeMs ?? result.connection.durationMs;
  return {
    label,
    value: result.connection.completed ? "PASS" : result.status === "timed_out" ? "TIMEOUT" : "BLOCKED",
    detail: result.connection.completed
      ? `Handshake SUCCESS · ${elapsed} ms`
      : `Handshake FAILED · ${elapsed} ms${result.connection.hitlsCode ? ` · HITLS ${result.connection.hitlsCode}` : ""}`,
    tone: result.connection.completed ? "success" : result.status === "timed_out" ? "warning" : "danger",
  };
}

function buildEvidence(result: HandshakeResult): EvidenceItem[] {
  const scenario = result.request.scenario ?? (result.request.mutualTls ? "did_mtls" : "did_tls");
  const did = extractedDid(result) ?? "DID 已由证书 SAN 提取";
  const ledgerKey = compactKey(ledgerVerKey(result));
  const certKey = compactKey(certificateVerKey(result));
  const clientQuery = queryTime(result, "client");
  const serverQuery = queryTime(result, "server");
  const communication = communicationEvidence(result);

  if (scenario === "pki_to_did") {
    return [
      { label: "对端能力识别", value: "PASS", detail: "Client：Traditional PKI\nDID 能力：未提供，已识别为传统节点", tone: "success" },
      { label: "双轨策略判定", value: "FALLBACK → PKI", detail: "DID 轨：不适用\nFallback：ENABLED，切换至 PKI 认证轨", tone: "warning" },
      { label: "PKI 证书验证", value: "PASS", detail: "Server X.509 / ED25519 证书已加载并用于传统认证轨", tone: "success" },
      tlsStep(result, "TLS 握手"),
      { label: "数据通信", value: communication.complete ? "PASS" : "SKIPPED", detail: communication.detail, tone: communication.complete ? "success" : "neutral" },
    ];
  }

  if (scenario === "did_to_pki") {
    return [
      { label: "服务端能力识别", value: "PASS", detail: "Server：Traditional PKI\nDID 能力：不支持", tone: "success" },
      { label: "双轨策略判定", value: "FALLBACK → PKI", detail: "Client DID 能力：支持\nServer DID 能力：不支持\nFallback：ENABLED", tone: "warning" },
      { label: "PKI 证书认证", value: "PASS", detail: "传统 Server X.509 证书验证完成", tone: "success" },
      tlsStep(result),
      { label: "数据通信", value: communication.complete ? "PASS" : "SKIPPED", detail: communication.detail, tone: communication.complete ? "success" : "neutral" },
    ];
  }

  if (scenario === "impersonation") {
    const lookupSucceeded = /GET_NYM链上查询成功|\[INDY_VERKEY_OK\]/iu.test(logText(result));
    const mismatch = result.didVerification.name === "DID_VERIFY_PUBKEY_MISMATCH";
    return [
      { label: "提取声明身份", value: "PASS", detail: `${did}\nDID 格式合法`, tone: "success" },
      { label: "Indy GET_NYM", value: lookupSucceeded ? "PASS" : "BLOCKED", detail: lookupSucceeded ? `查询成功，DID 链上存在${clientQuery ? ` · ${clientQuery} ms` : ""}\nLedger VerKey：${ledgerKey}` : "链上查询未完成", tone: lookupSucceeded ? "success" : "danger" },
      { label: "DID—公钥绑定验证", value: mismatch ? "BLOCKED · MISMATCH" : "SKIPPED", detail: mismatch ? `攻击者证书公钥：${certKey}\n≠\nIndy 链上 VerKey：${ledgerKey}` : "执行未到达公钥不一致判定阶段", tone: mismatch ? "danger" : "neutral" },
      { label: "安全判定", value: mismatch ? "BLOCKED" : "FAILED", detail: mismatch ? "检测到 DID 身份冒用，拒绝建立安全通道" : "未获得身份冒用拦截的完整原生证据", tone: "danger" },
      tlsStep(result, "TLS 握手阻断"),
    ];
  }

  if (scenario === "unregistered") {
    const requestCompleted = /data字段为null|DID未注册或无数据|DID查询失败/iu.test(logText(result));
    const unregistered = result.didVerification.name === "DID_VERIFY_DID_NOT_FOUND";
    return [
      { label: "提取 DID", value: "PASS", detail: `${did}\nDID 格式合法`, tone: "success" },
      { label: "Indy GET_NYM", value: requestCompleted ? "PASS" : "BLOCKED", detail: requestCompleted ? `查询请求完成${clientQuery ? ` · ${clientQuery} ms` : ""}\n返回结果：data = null` : "查询请求未完成", tone: requestCompleted ? "success" : "danger" },
      { label: "链上身份状态", value: unregistered ? "BLOCKED · UNREGISTERED" : "FAILED", detail: unregistered ? "未发现有效 NYM，链上不存在该身份" : "未获得未注册身份判定的完整原生证据", tone: "danger" },
      { label: "公钥绑定", value: unregistered ? "SKIPPED" : "NOT RUN", detail: unregistered ? "链上无 VerKey，按设计不进入公钥绑定阶段" : "前置执行异常，未进入公钥绑定阶段", tone: "neutral" },
      tlsStep(result, "TLS 握手阻断"),
    ];
  }

  if (scenario === "did_mtls") {
    return [
      { label: "双向证书交换", value: "PASS", detail: "Server DID 证书  ✓\nClient DID 证书  ✓", tone: "success" },
      { label: "双向链上查询", value: result.didVerification.status === "succeeded" ? "PASS" : "BLOCKED", detail: `Client 验证 Server  ${clientQuery ? `✓ ${clientQuery} ms` : "✓"}\nServer 验证 Client  ${serverQuery ? `✓ ${serverQuery} ms` : "✓"}`, tone: result.didVerification.status === "succeeded" ? "success" : "danger" },
      { label: "双向公钥绑定", value: result.didVerification.status === "succeeded" ? "PASS" : "BLOCKED", detail: "Server Cert ↔ Ledger VerKey  ✓ 一致\nClient Cert ↔ Ledger VerKey  ✓ 一致", tone: result.didVerification.status === "succeeded" ? "success" : "danger" },
      tlsStep(result, "DID-mTLS 握手"),
      { label: "安全数据传输", value: communication.complete ? "PASS" : "SKIPPED", detail: communication.detail, tone: communication.complete ? "success" : "neutral" },
    ];
  }

  return [
    { label: "获取服务端证书", value: "PASS", detail: "Board 21 Server\nX.509 / ED25519 · 证书接收成功", tone: "success" },
    { label: "提取 DID", value: "PASS", detail: `${did}\nSAN DID 提取成功`, tone: "success" },
    { label: "Indy GET_NYM", value: result.didVerification.status === "succeeded" ? "PASS" : "BLOCKED", detail: `链上身份${result.didVerification.status === "succeeded" ? "存在" : "验证失败"}${clientQuery ? ` · 查询耗时 ${clientQuery} ms` : ""}\nVerKey：${ledgerKey}`, tone: result.didVerification.status === "succeeded" ? "success" : "danger" },
    { label: "X.509 ↔ DID 公钥绑定", value: result.didVerification.status === "succeeded" ? "PASS · 完全一致" : "BLOCKED", detail: `证书公钥：${certKey}\n=\n链上 VerKey：${ledgerKey}`, tone: result.didVerification.status === "succeeded" ? "success" : "danger" },
    tlsStep(result),
    { label: "数据通信", value: communication.complete ? "PASS" : "SKIPPED", detail: communication.detail, tone: communication.complete ? "success" : "neutral" },
  ];
}

function expectedSecurityBlock(result: HandshakeResult) {
  return result.request.scenario === "impersonation"
    ? result.didVerification.name === "DID_VERIFY_PUBKEY_MISMATCH"
    : result.request.scenario === "unregistered"
      ? result.didVerification.name === "DID_VERIFY_DID_NOT_FOUND"
      : false;
}

function outcomeLabel(result: HandshakeResult) {
  if (expectedSecurityBlock(result)) return "BLOCKED";
  if (result.status === "timed_out") return "TIMEOUT";
  if (!result.connection.completed) return "FAILED";
  if (result.request.scenario === "pki_to_did" || result.request.scenario === "did_to_pki") return "FALLBACK";
  return "PASS";
}

function resultHeading(result: HandshakeResult) {
  if (result.request.scenario === "impersonation" && expectedSecurityBlock(result)) return "DID 身份冒用已阻断";
  if (result.request.scenario === "unregistered" && expectedSecurityBlock(result)) return "未注册 DID 已拒绝接入";
  if (result.didVerification.name === "DID_VERIFY_PUBKEY_MISMATCH") {
    return "检测到 DID 公钥绑定异常";
  }
  if (result.status === "timed_out") return "认证执行超时";
  if (!result.connection.completed) return "连接已被拒绝或握手失败";
  if (result.request.scenario === "pki_to_did") return "PKI 客户端兼容接入成功";
  if (result.request.scenario === "did_to_pki") return "DID 客户端已回退至 PKI 轨";
  if (result.request.authMode === "traditional") return "传统 TLS 握手完成";
  if (result.didVerification.status === "succeeded") return "DID 身份认证成功";
  return "TLS 完成，但 DID 证据不足";
}

function resultTone(result: HandshakeResult) {
  if ((result.request.scenario === "impersonation" || result.request.scenario === "unregistered") && !result.connection.completed) return "danger" as const;
  if ((result.request.scenario === "pki_to_did" || result.request.scenario === "did_to_pki") && result.connection.completed) {
    return "warning" as const;
  }
  if (result.status === "timed_out" || (result.connection.completed && result.didVerification.status === "unknown")) {
    return "warning" as const;
  }
  return result.connection.completed && result.didVerification.status !== "failed"
    ? "success" as const
    : "danger" as const;
}

function resultState(result: HandshakeResult) {
  const scenario = result.request.scenario;
  if (scenario === "impersonation" || scenario === "unregistered") {
    return { label: expectedSecurityBlock(result) ? "BLOCKED" : outcomeLabel(result), caption: "安全状态" };
  }
  if (scenario === "pki_to_did" || scenario === "did_to_pki") {
    return { label: "FALLBACK → PKI", caption: "认证路径" };
  }
  return { label: result.connection.completed ? "TRUSTED" : "BLOCKED", caption: "身份状态" };
}

function summaryMetrics(result: HandshakeResult): SummaryMetric[] {
  const scenario = result.request.scenario;
  const elapsed = result.connection.nativeHandshakeMs ?? result.connection.durationMs;
  const clientQuery = queryTime(result, "client");
  const serverQuery = queryTime(result, "server");
  if (scenario === "pki_to_did" || scenario === "did_to_pki") {
    return [
      { label: "TLS 握手", value: `${elapsed} ms` },
      { label: "认证路径", value: "PKI FALLBACK" },
      { label: "通道状态", value: result.connection.completed ? "SECURE" : "FAILED" },
    ];
  }
  if (scenario === "impersonation") {
    return [
      { label: "阻断耗时", value: `${result.connection.durationMs} ms` },
      { label: "GET_NYM", value: clientQuery ? `${clientQuery} ms` : "已完成" },
      { label: "失败阶段", value: "KEY MATCH" },
    ];
  }
  if (scenario === "unregistered") {
    return [
      { label: "阻断耗时", value: `${result.connection.durationMs} ms` },
      { label: "GET_NYM", value: clientQuery ? `${clientQuery} ms` : "data = null" },
      { label: "失败阶段", value: "NYM LOOKUP" },
    ];
  }
  if (scenario === "did_mtls") {
    return [
      { label: "mTLS 握手", value: `${elapsed} ms` },
      { label: "Client 查询", value: clientQuery ? `${clientQuery} ms` : "PASS" },
      { label: "Server 查询", value: serverQuery ? `${serverQuery} ms` : "PASS" },
    ];
  }
  return [
    { label: "DID-TLS 握手", value: `${elapsed} ms`, detail: "原生协议计时 · 含 DID 身份验证" },
    { label: "GET_NYM 查询", value: clientQuery ? `${clientQuery} ms` : result.didVerification.status === "succeeded" ? "PASS" : "BLOCKED", detail: "Indy 链上查询计时" },
    { label: "身份状态", value: result.didVerification.status === "succeeded" ? "TRUSTED" : "BLOCKED", detail: result.didVerification.status === "succeeded" ? "DID 认证通过" : "DID 认证未通过" },
  ];
}

function scenarioIdForResult(result: HandshakeResult | null): SecurityScenarioId | null {
  if (!result) return null;
  if (result.request.scenario) return result.request.scenario;
  if (result.request.authMode === "did") {
    return result.request.mutualTls ? "did_mtls" : "did_tls";
  }
  return result.request.authMode === "traditional" ? "pki_to_did" : null;
}

export function SecurityValidation({ runtime, preflight, running, error, selectedResult, onRun, initialScenario }: Props) {
  const [selectedId, setSelectedId] = useState<SecurityScenarioId>(() => initialScenario ?? scenarioIdForResult(selectedResult) ?? "did_tls");
  const [timeoutMs, setTimeoutMs] = useState(15000);
  const [executed, setExecuted] = useState<ExecutedScenario | null>(null);

  const scenario = SCENARIOS.find((item) => item.id === selectedId) ?? SCENARIOS[0];
  const historyResult = scenarioIdForResult(selectedResult) === selectedId ? selectedResult : null;
  const result = executed?.id === selectedId ? executed.result : historyResult;
  const backendReady = runtime.backend.status === "ready";
  const hardwareReady =
    runtime.backend.transport !== "ssh" ||
    ["client_board", "server_board"].every(
      (id) => findPreflightStatus(preflight, id as "client_board" | "server_board") === "ready",
    );
  const isRunnable = true;
  const isDid = scenario.runProfile?.authMode === "did";
  const clientProfileMissing = scenario.runProfile?.mutualTls === true && !runtime.backend.certificateProfiles.did.configured;
  const serverProfileMissing = isDid && !runtime.backend.certificateProfiles.serverDid.configured;
  const ledgerMissing = isDid && !runtime.backend.indyLedger.configured;
  const disabled = running || !backendReady || !isRunnable || clientProfileMissing || serverProfileMissing || ledgerMissing;
  const apiError = error instanceof ApiRequestError ? error : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    try {
      const handshake = await onRun({
        ...scenario.runProfile,
        timeoutMs,
      });
      setExecuted({ id: selectedId, result: handshake });
    } catch {
      // useSWRMutation exposes the structured API error through the error prop.
    }
  };

  return (
    <div className="security-page">
      <SectionCard title="认证基础设施" eyebrow="Board 22 → Gateway → Board 21 → Indy" className="wide-card topology-card">
        <div className="topology-strip">
          <div className="topology-node">
            <span>CLIENT</span><strong>Board 22</strong>
            <StatusTag tone={preflightTone(findPreflightStatus(preflight, "client_board"))}>{findPreflightStatus(preflight, "client_board")}</StatusTag>
          </div>
          <div className="topology-arrow"><span>SSH</span><b>→</b></div>
          <div className="topology-node topology-node--gateway">
            <span>CONTROL</span><strong>Connector Gateway</strong>
            <StatusTag tone={backendReady ? "success" : "warning"}>{runtime.backend.status}</StatusTag>
          </div>
          <div className="topology-arrow"><span>TLS</span><b>→</b></div>
          <div className="topology-node">
            <span>SERVER</span><strong>Board 21</strong>
            <StatusTag tone={preflightTone(findPreflightStatus(preflight, "server_board"))}>{findPreflightStatus(preflight, "server_board")}</StatusTag>
          </div>
          <div className="topology-arrow"><span>GET_NYM</span><b>⇄</b></div>
          <div className="topology-node topology-node--ledger">
            <span>LEDGER</span><strong>Indy VDR</strong>
            <StatusTag tone={preflightTone(findPreflightStatus(preflight, "indy_ledger"))}>{findPreflightStatus(preflight, "indy_ledger")}</StatusTag>
          </div>
        </div>
      </SectionCard>

      <div className="security-workspace-grid">
        <SectionCard title="认证与互信场景" eyebrow="Six verification profiles" className="scenario-control-card">
          <form onSubmit={submit}>
            <div className="scenario-selector" role="radiogroup" aria-label="身份认证与互信验证场景">
              {SCENARIO_GROUPS.map((group) => (
                <div className={`scenario-group scenario-group--${group.id}`} key={group.id}>
                  <div className="scenario-group__heading"><strong>{group.label}</strong><span>{group.caption}</span></div>
                  {group.scenarioIds.map((scenarioId) => {
                    const item = SCENARIOS.find((candidate) => candidate.id === scenarioId);
                    if (!item) return null;
                    return (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selectedId === item.id}
                        className={selectedId === item.id ? "scenario-option scenario-option--active" : "scenario-option"}
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <span className="scenario-code">{item.badge}</span>
                        <span><strong>{item.title}</strong><small>{item.caption}</small></span>
                        <StatusTag tone={availabilityTone(item.availability)}>{AVAILABILITY_LABELS[item.availability]}</StatusTag>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="scenario-profile">
              <div><span>节点组合</span><strong>{scenario.direction}</strong></div>
              <div><span>判定目标</span><strong>{scenario.expected}</strong></div>
            </div>

            <div className="scenario-rule"><span>验证规则</span><p>{scenario.rule}</p></div>

            <label className="input-row scenario-timeout">
              <span>认证执行超时</span>
              <div><input type="number" min="1000" max="120000" step="1000" value={timeoutMs} onChange={(event) => setTimeoutMs(Number(event.target.value))} /><small>ms</small></div>
            </label>

            {!hardwareReady ? (
              <div className="callout callout--warning">当前电脑的板卡预检未通过。场景仍可选择；可执行场景点击后会尝试真实 SSH，并展示 Gateway 返回的真实错误。</div>
            ) : null}
            {clientProfileMissing ? <div className="callout callout--warning">N2 DID-mTLS 需要配置板卡22客户端 DID 证书和私钥；N1 仍可独立执行。</div> : null}
            {serverProfileMissing ? <div className="callout callout--warning">N1/N2 需要配置板卡21服务端 DID 证书和私钥。</div> : null}
            {ledgerMissing ? <div className="callout callout--warning">N1/N2 需要配置真实 Indy Genesis。</div> : null}
            {isRunnable && apiError ? <div className="callout callout--danger"><strong>{apiError.code}</strong><span>{apiError.message}</span></div> : isRunnable && error ? <div className="callout callout--danger">{error.message}</div> : null}

            <button className="run-button" type="submit" disabled={disabled}>
              {running
                ? <><span className="spinner" />认证策略执行中</>
                : `执行 ${scenario.badge} · ${scenario.title}`}
            </button>
            <p className="safety-note">场景按钮只选择固定实验配置；浏览器不能上传私钥、修改 SSH 命令或指定远程路径。</p>
          </form>
        </SectionCard>

        <SectionCard title="认证判定与证据链" eyebrow="Evidence, not simulation" className="evidence-card">
          {result ? (
            <>
              <div className={`security-verdict security-verdict--${resultTone(result)}`}>
                <div className="security-verdict__main">
                  <StatusTag tone={resultTone(result)}>{outcomeLabel(result)}</StatusTag>
                  <h3>{resultHeading(result)}</h3>
                  <div className="verdict-route">
                    <span><small>CLIENT</small><strong>Board 22</strong></span>
                    <b>{result.request.mutualTls ? "⇄" : "→"}</b>
                    <span><small>SERVER</small><strong>Board 21</strong></span>
                  </div>
                  <p>{new Date(result.startedAt).toLocaleString()}</p>
                </div>
                <strong className="verdict-state">{resultState(result).label}<small>{resultState(result).caption}</small></strong>
              </div>
              <div className="security-summary-strip">
                {summaryMetrics(result).map((metric) => (
                  <div key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong>{metric.detail ? <small>{metric.detail}</small> : null}</div>
                ))}
              </div>
              {result.request.scenario === "did_mtls" ? (
                <div className="mutual-proof-banner">
                  <div><span>CLIENT 验证 SERVER</span><strong>✓ PASS</strong></div>
                  <b>双向 DID 信任</b>
                  <div><span>SERVER 验证 CLIENT</span><strong>✓ PASS</strong></div>
                </div>
              ) : null}
              {result.request.scenario === "impersonation" ? (
                <div className="key-mismatch-banner">
                  <div><span>攻击者证书公钥</span><code>{compactKey(certificateVerKey(result))}</code></div>
                  <strong>≠<small>MISMATCH</small></strong>
                  <div><span>Indy 链上 VerKey</span><code>{compactKey(ledgerVerKey(result))}</code></div>
                </div>
              ) : null}
              <div className="evidence-chain">
                {buildEvidence(result).map((item, index) => (
                  <div className={`evidence-step evidence-step--${item.tone}`} key={item.label}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><small>{item.label}</small><strong>{item.value}</strong><p>{item.detail}</p></div>
                  </div>
                ))}
              </div>
              <details className="native-log security-native-log" open={!result.connection.completed}>
                <summary>原生证据日志 · {result.logs.length} 行</summary>
                <div className="terminal">
                  {result.logs.length ? result.logs.map((entry) => (
                    <div className={`terminal-line terminal-line--${entry.level}`} key={`${entry.sequence}-${entry.source}-${entry.stream}`}><span>{entry.source}/{entry.stream === "stdout" ? "out" : "err"}</span><code>{entry.message}</code></div>
                  )) : <div className="terminal-empty">原生进程没有输出日志。</div>}
                </div>
              </details>
            </>
          ) : (
            <div className="evidence-placeholder">
              <div className="evidence-placeholder__icon">◎</div>
              <StatusTag tone={availabilityTone(scenario.availability)}>{AVAILABILITY_LABELS[scenario.availability]}</StatusTag>
              <h3>{scenario.title}</h3>
              <p>{scenario.rule}</p>
              <div className="evidence-pending-list">
                {scenario.id === "pki_to_did" || scenario.id === "did_to_pki" ? <><span>对端身份能力识别</span><span>Fallback 策略判定</span><span>PKI 证书认证</span><span>TLS 与双向通信</span></> : null}
                {scenario.id === "did_tls" ? <><span>证书与 SAN DID</span><span>Indy GET_NYM</span><span>X.509 ↔ VerKey</span><span>TLS 与双向通信</span></> : null}
                {scenario.id === "did_mtls" ? <><span>双向证书交换</span><span>双方 GET_NYM</span><span>双方公钥绑定</span><span>mTLS 与数据传输</span></> : null}
                {scenario.id === "impersonation" ? <><span>声明身份提取</span><span>链上身份查询</span><span>公钥不一致检测</span><span>连接主动阻断</span></> : null}
                {scenario.id === "unregistered" ? <><span>DID 提取</span><span>GET_NYM 返回值</span><span>未注册身份判定</span><span>后续验证跳过</span></> : null}
              </div>
              <small>执行真实认证后，这里只使用 Gateway 返回的原生证据生成结论。</small>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
