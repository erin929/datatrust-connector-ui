import { useState, type FormEvent } from "react";
import type {
  HandshakeRequest,
  HandshakeResult,
  RuntimeInfo,
  RuntimePreflight,
} from "../../../shared/runtime-contract";
import { SectionCard } from "../../shared/components/ui/SectionCard";
import { StatusTag } from "../../shared/components/ui/StatusTag";
import { ApiRequestError } from "../../shared/services/runtime-api";

type SecurityScenarioId =
  | "did_tls"
  | "did_mtls"
  | "pki_to_did"
  | "did_to_pki"
  | "impersonation"
  | "unregistered";

type ScenarioAvailability = "ready" | "needs_profile" | "needs_fallback";

type SecurityScenario = {
  id: SecurityScenarioId;
  title: string;
  caption: string;
  badge: string;
  availability: ScenarioAvailability;
  direction: string;
  expected: string;
  rule: string;
  runProfile: Pick<HandshakeRequest, "authMode" | "mutualTls"> | null;
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
    runProfile: { authMode: "did", mutualTls: false },
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
    runProfile: { authMode: "did", mutualTls: true },
  },
  {
    id: "pki_to_did",
    title: "传统 Client → DID Server",
    caption: "存量 PKI 客户端兼容接入",
    badge: "N3",
    availability: "needs_fallback",
    direction: "Traditional PKI Client → DID-compatible Server",
    expected: "识别传统节点并协商至 PKI 轨",
    rule: "服务端识别客户端不具备 DID 身份能力后，只有启用兼容策略才允许进入传统 PKI 认证轨。",
    runProfile: null,
  },
  {
    id: "did_to_pki",
    title: "DID Client → 传统 Server",
    caption: "DID 客户端访问存量服务端",
    badge: "N4",
    availability: "needs_fallback",
    direction: "DID-capable Client → Traditional PKI Server",
    expected: "DID 轨不可用时协商至 PKI 轨",
    rule: "客户端发现服务端不支持 DID 后，应由明确的 Fallback 策略决定是否切换至传统 PKI 认证。",
    runProfile: null,
  },
  {
    id: "impersonation",
    title: "DID 身份冒用",
    caption: "合法 DID + 攻击者证书密钥",
    badge: "A1",
    availability: "needs_profile",
    direction: "Attacker Server → DID-verifying Client",
    expected: "VerKey 不匹配，拒绝连接",
    rule: "合法 DID 在链上存在，但伪造证书公钥与链上 VerKey 不一致时必须拒绝连接。",
    runProfile: null,
  },
  {
    id: "unregistered",
    title: "未注册 DID",
    caption: "证书含 DID、链上无 NYM",
    badge: "A2",
    availability: "needs_profile",
    direction: "Unregistered DID Server → DID-verifying Client",
    expected: "链上无身份记录，拒绝连接",
    rule: "证书格式与签名正常，但 GET_NYM 没有身份记录时必须拒绝连接。",
    runProfile: null,
  },
];

const SCENARIO_GROUPS: readonly ScenarioGroup[] = [
  { id: "normal", label: "正常认证", caption: "DID 身份可信", scenarioIds: ["did_tls", "did_mtls"] },
  { id: "compatibility", label: "双轨兼容", caption: "DID / PKI 异构互信", scenarioIds: ["pki_to_did", "did_to_pki"] },
  { id: "security", label: "异常拦截", caption: "身份冒用与未注册身份", scenarioIds: ["impersonation", "unregistered"] },
];

const AVAILABILITY_LABELS = {
  ready: "可执行",
  needs_profile: "待证书接入",
  needs_fallback: "待双轨接入",
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

function didEvidence(result: HandshakeResult): EvidenceItem {
  if (result.request.authMode === "traditional") {
    return {
      label: "Indy GET_NYM",
      value: "未执行",
      detail: "Traditional TLS 不查询 DID 账本。",
      tone: "neutral",
    };
  }
  if (result.didVerification.status === "succeeded") {
    return {
      label: "Indy GET_NYM",
      value: "成功",
      detail: result.didVerification.message ?? "原生日志提供了链上查询成功证据。",
      tone: "success",
    };
  }
  if (result.didVerification.status === "failed") {
    return {
      label: "Indy GET_NYM",
      value: "失败",
      detail: result.didVerification.message ?? "链上 DID 验证失败。",
      tone: "danger",
    };
  }
  return {
    label: "Indy GET_NYM",
    value: "证据不足",
    detail: result.didVerification.message ?? "原生程序没有输出可识别的链上验证结果。",
    tone: "warning",
  };
}

function keyBindingEvidence(result: HandshakeResult): EvidenceItem {
  if (result.request.authMode === "traditional") {
    return {
      label: "DID—公钥绑定",
      value: "不适用",
      detail: "本次连接只执行传统 PKI 证书验证。",
      tone: "neutral",
    };
  }
  if (result.didVerification.name === "DID_VERIFY_PUBKEY_MISMATCH") {
    return {
      label: "DID—公钥绑定",
      value: "不一致",
      detail: "原生验证端报告证书公钥与链上 VerKey 不匹配。",
      tone: "danger",
    };
  }
  if (result.didVerification.status === "succeeded") {
    return {
      label: "DID—公钥绑定",
      value: "一致",
      detail: "GET_NYM 成功且 DID 验证完成。",
      tone: "success",
    };
  }
  return {
    label: "DID—公钥绑定",
    value: "未判定",
    detail: "当前错误发生在完成公钥绑定判定之前，或原生日志证据不足。",
    tone: "warning",
  };
}

function buildEvidence(result: HandshakeResult): EvidenceItem[] {
  return [
    {
      label: "对端证书模式",
      value: result.negotiation.peerCertificateMode,
      detail: `原生协商报告的本地证书模式为 ${result.negotiation.localCertificateMode}。`,
      tone: result.negotiation.peerCertificateMode === "UNKNOWN" ? "warning" : "success",
    },
    didEvidence(result),
    keyBindingEvidence(result),
    {
      label: "TLS 握手",
      value: result.connection.completed ? "已完成" : "未完成",
      detail: result.connection.completed
        ? `原生握手耗时 ${result.connection.nativeHandshakeMs ?? result.connection.durationMs} ms。`
        : `HITLS ${result.connection.hitlsCode ?? "未报告错误码"}；TLS Alert ${result.connection.tlsAlert ?? "未报告"}。`,
      tone: result.connection.completed ? "success" : result.status === "timed_out" ? "warning" : "danger",
    },
  ];
}

function resultHeading(result: HandshakeResult) {
  if (result.didVerification.name === "DID_VERIFY_PUBKEY_MISMATCH") {
    return "检测到 DID 公钥绑定异常";
  }
  if (result.status === "timed_out") return "认证执行超时";
  if (!result.connection.completed) return "连接已被拒绝或握手失败";
  if (result.request.authMode === "traditional") return "传统 TLS 握手完成";
  if (result.didVerification.status === "succeeded") return "DID 身份认证成功";
  return "TLS 完成，但 DID 证据不足";
}

function resultTone(result: HandshakeResult) {
  if (result.status === "timed_out" || (result.connection.completed && result.didVerification.status === "unknown")) {
    return "warning" as const;
  }
  return result.connection.completed && result.didVerification.status !== "failed"
    ? "success" as const
    : "danger" as const;
}

function scenarioIdForResult(result: HandshakeResult | null): SecurityScenarioId | null {
  if (!result) return null;
  if (result.request.authMode === "did") {
    return result.request.mutualTls ? "did_mtls" : "did_tls";
  }
  return result.request.authMode === "traditional" ? "pki_to_did" : null;
}

export function SecurityValidation({ runtime, preflight, running, error, selectedResult, onRun }: Props) {
  const [selectedId, setSelectedId] = useState<SecurityScenarioId>(() => scenarioIdForResult(selectedResult) ?? "did_tls");
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
  const isRunnable = scenario.runProfile !== null;
  const isDid = scenario.runProfile?.authMode === "did";
  const clientProfileMissing = scenario.runProfile?.mutualTls === true && !runtime.backend.certificateProfiles.did.configured;
  const serverProfileMissing = isDid && !runtime.backend.certificateProfiles.serverDid.configured;
  const ledgerMissing = isDid && !runtime.backend.indyLedger.configured;
  const disabled = running || !backendReady || !isRunnable || clientProfileMissing || serverProfileMissing || ledgerMissing;
  const apiError = error instanceof ApiRequestError ? error : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled || !scenario.runProfile) return;
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

            {scenario.availability === "needs_profile" ? (
              <div className="callout callout--warning">需要先在板卡21准备该场景的固定证书和私钥，并由 Gateway 使用白名单场景映射。当前页面不会生成模拟结果。</div>
            ) : null}
            {scenario.availability === "needs_fallback" ? (
              <div className="callout callout--warning">该异构场景需要分别配置客户端与服务端身份能力，并由板卡明确输出 DID/PKI 协商轨道和 Fallback 是否生效；当前不会用普通 Traditional TLS 冒充双轨结果。</div>
            ) : null}
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
                : !isRunnable
                  ? scenario.availability === "needs_fallback" ? "等待双轨协商接口" : "等待场景证书接入"
                  : `执行 ${scenario.badge} · ${scenario.title}`}
            </button>
            <p className="safety-note">场景按钮只选择固定实验配置；浏览器不能上传私钥、修改 SSH 命令或指定远程路径。</p>
          </form>
        </SectionCard>

        <SectionCard title="认证判定与证据链" eyebrow="Evidence, not simulation" className="evidence-card">
          {result ? (
            <>
              {scenario.availability === "needs_fallback" && result.request.authMode === "traditional" ? <div className="callout callout--warning">这是一条历史 Traditional TLS 基线记录，只能证明传统握手结果，不能证明 N3/N4 已发生 Fallback 协商。</div> : null}
              <div className={`security-verdict security-verdict--${resultTone(result)}`}>
                <div><StatusTag tone={resultTone(result)}>{result.status}</StatusTag><h3>{resultHeading(result)}</h3><p>{new Date(result.startedAt).toLocaleString()} · {result.connection.target.host}:{result.connection.target.port}</p></div>
                <strong>{result.didVerification.code === null ? "—" : result.didVerification.code}<small>DID code</small></strong>
              </div>
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
                <span>节点证书与身份能力</span>
                <span>DID / PKI 协商轨道</span>
                <span>GET_NYM 与公钥绑定</span>
                <span>TLS / HITLS 最终结果</span>
              </div>
              <small>{isRunnable ? "执行真实认证后，这里只使用 Gateway 返回的原生证据生成结论。" : "该场景尚未接入真实证书配置，因此不会提前显示 PASS 或 BLOCK。"}</small>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
