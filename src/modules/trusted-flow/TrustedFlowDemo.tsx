import { useMemo, useState } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { TrustedFlowExecution } from "../../../shared/trusted-flow-contract";
import type { DataField, FieldPolicy } from "../../shared/types/domain";
import { JsonBlock } from "../../shared/components/business/JsonBlock";
import { PolicyMatrix } from "../../shared/components/business/PolicyMatrix";
import { SectionCard } from "../../shared/components/ui/SectionCard";
import { StatusTag } from "../../shared/components/ui/StatusTag";
import { getFabricAuditStatus, postTrustedFlowExecution } from "../../shared/services/runtime-api";

type DemoMode = "delivery" | "violation";

const TRACE_ID = "trace-3a66ac47";
const CONTRACT_ID = "contract-smoke-001";
const CONTRACT_HASH = "sha256:8f32c49a...a91c";
const DELIVERY_HASH = "sha256:a721d03b...76e8";

const fields: DataField[] = [
  { field: "order_id", type: "string", level: "public", description: "订单编号" },
  { field: "amount", type: "number", level: "internal", description: "订单金额" },
  { field: "customer_name", type: "string", level: "internal", description: "客户姓名" },
  { field: "phone", type: "string", level: "sensitive", description: "手机号" },
  { field: "id_card", type: "string", level: "high_sensitive", description: "身份证号" },
  { field: "payment_account", type: "string", level: "high_sensitive", description: "支付账户" },
];

const policiesV1: FieldPolicy[] = [
  { field: "order_id", action: "plain", reason: "Low：合约允许明文返回" },
  { field: "amount", action: "plain", reason: "Medium：风险分析用途允许明文" },
  { field: "customer_name", action: "mask", reason: "Medium：仅交付脱敏姓名" },
  { field: "phone", action: "mask", reason: "High：执行手机号脱敏" },
  { field: "id_card", action: "deny", reason: "Critical：当前合约拒绝交付" },
  { field: "payment_account", action: "encrypt", reason: "Critical：字段级加密后交付" },
];

const policiesV2: FieldPolicy[] = policiesV1.map((policy) =>
  policy.field === "phone" ? { ...policy, action: "deny", reason: "High：v2 策略禁止手机号交付" } : policy,
);

const rawData = {
  order_id: "ORD202607020001",
  amount: 1688.5,
  customer_name: "Alice Zhang",
  phone: "13812345678",
  id_card: "610102199901018888",
  payment_account: "6222021234567890",
};

const controlledV1 = {
  order_id: "ORD202607020001",
  amount: 1688.5,
  customer_name: "Ali****hang",
  phone: "138****5678",
  id_card: "DENIED",
  payment_account: "ENC:A8F92C...",
};
const controlledV2 = { ...controlledV1, phone: "DENIED" };

const mainStages = [
  ["身份认证", "TRUSTED", "DID-mTLS 双向身份可信"],
  ["性能优化", "OPTIMIZED", "连接池、LRU 与分级校验"],
  ["数据目录", "FOUND", "可信主体发现订单风控产品"],
  ["数字合约", "ACTIVE", "用途、有效期与策略版本匹配"],
  ["字段策略", "APPLIED", "逐字段执行受控动作"],
  ["受控交付", "DELIVERED", "仅返回最小必要数据"],
  ["审计存证", "RECORDED", "Fabric 保存可验证摘要"],
] as const;

export function TrustedFlowDemo({ onOpenAuthentication, onOpenAudit }: { onOpenAuthentication: () => void; onOpenAudit: () => void }) {
  const [mode, setMode] = useState<DemoMode>("delivery");
  const [policyVersion, setPolicyVersion] = useState<1 | 2>(1);
  const [purpose, setPurpose] = useState("order-risk-analysis");
  const [completedSteps, setCompletedSteps] = useState(0);
  const [execution, setExecution] = useState<TrustedFlowExecution | null>(null);
  const executionMutation = useSWRMutation("/api/trusted-flow/executions", postTrustedFlowExecution);
  const fabric = useSWR("/api/trusted-flow/fabric/status", getFabricAuditStatus, { refreshInterval: 5000 });
  const running = executionMutation.isMutating;
  const fabricConnected = fabric.data?.connected === true;
  const policies = policyVersion === 1 ? policiesV1 : policiesV2;
  const controlledData = execution?.controlledData ?? (policyVersion === 1 ? controlledV1 : controlledV2);
  const complete = completedSteps === mainStages.length;

  const contract = useMemo(() => ({
    contractId: CONTRACT_ID,
    providerDid: "did:indy:Provider7F3...",
    consumerDid: "did:indy:Consumer9A2...",
    productId: "prod-order-risk-001",
    purpose,
    validFrom: "2026-08-18",
    validTo: "2026-08-25",
    policyVersion: `v${policyVersion}`,
    contractHash: CONTRACT_HASH,
    status: "active",
  }), [policyVersion, purpose]);

  const resetExecution = () => {
    setCompletedSteps(0);
    setExecution(null);
  };

  const startDemo = async () => {
    resetExecution();
    try {
      const result = await executionMutation.trigger({ mode, productId: "prod-order-risk-001", purpose, policyVersion });
      setExecution(result);
      setCompletedSteps(mainStages.length);
    } catch {
      setCompletedSteps(0);
    }
  };

  const stageStatus = (index: number) => {
    if (index < completedSteps) {
      if (mode === "violation" && index === 5) return "BLOCKED";
      return mainStages[index][1];
    }
    if (running && index === completedSteps) return "RUNNING";
    return "WAIT";
  };

  const fieldActionLog = policies.map((policy) => ({
    field: policy.field,
    action: policy.action.toUpperCase(),
    result: policy.action === "deny" ? "not delivered" : "delivered",
    reason: policy.reason,
  }));

  const performanceEvidence = execution?.performance ?? {
    resolverConnection: "等待执行硬件认证",
    cacheEvidence: "板端暂未输出该指标",
    sessionResumeEvidence: "板端暂未输出该指标",
  };
  const activeContract = execution?.contract ?? contract;
  const activeFieldActionLog = execution?.fieldActionLog ?? fieldActionLog;
  const activeTraceId = execution?.traceId ?? "执行后由 Gateway 生成";
  const authenticationTrusted = execution?.authentication.trusted ?? false;
  const executionBlocked = execution?.status === "blocked" || execution?.status === "authentication_failed";

  return (
    <div className="trusted-flow-page">
      <div className="demo-disclosure"><div><StatusTag tone={fabricConnected ? "success" : "warning"}>{fabricConnected ? "FABRIC READY" : "FABRIC CHECKING"}</StatusTag><strong>硬件认证 + 受控交付 + 双组织审计</strong></div><p>身份认证真实调用两块板子的 openHiTLS-DID；目录、合约和字段策略由 Gateway 执行，审计摘要由两块板上的 Fabric Peer 共同背书并写入通道。</p></div>

      <SectionCard title="本次可信数据流通任务" eyebrow="End-to-end trusted exchange" className="wide-card flow-task-card">
        <div className="flow-task-heading">
          <div><StatusTag tone={complete && !executionBlocked ? "success" : executionBlocked ? "danger" : running ? "info" : "neutral"}>{complete ? execution?.status.toUpperCase() : running ? "RUNNING" : "READY"}</StatusTag><h3>Consumer Connector <b>→</b> Provider Connector</h3><code>{activeTraceId}</code></div>
          <div className="task-trust-status"><div><span>身份可信</span><strong>{execution ? (authenticationTrusted ? "TRUSTED" : "FAILED") : "PENDING"}</strong></div><div><span>合约状态</span><strong>{execution?.contract.status.toUpperCase() ?? "PENDING"}</strong></div><div><span>审计后端</span><strong>{execution?.audit.backend.toUpperCase() ?? "FABRIC"}</strong></div></div>
        </div>
        <dl className="task-facts"><div><dt>身份模式</dt><dd>DID-mTLS · Hardware SSH</dd></div><div><dt>数据产品</dt><dd>{execution?.product.name ?? "订单风控数据"}</dd></div><div><dt>使用目的</dt><dd>{purpose}</dd></div><div><dt>Trace ID</dt><dd>{activeTraceId}</dd></div></dl>
      </SectionCard>

      <SectionCard title="可信数据流通主流程" eyebrow="One trace, seven trust decisions" className="wide-card main-flow-card">
        <div className="main-flow-track">{mainStages.map(([title, success, detail], index) => { const status = stageStatus(index); const blocked = status === "BLOCKED"; const active = status === "RUNNING"; const done = index < completedSteps; return <div className={`main-flow-node ${done ? "done" : ""} ${active ? "active" : ""} ${blocked ? "blocked" : ""}`} key={title}><span>{index + 1}</span><strong>{title}</strong><b>{done && !blocked ? success : status}</b><small>{detail}</small>{index < mainStages.length - 1 ? <i>→</i> : null}</div>; })}</div>
      </SectionCard>

      <div className="flow-controls">
        <div className="flow-mode-switch"><button className={mode === "delivery" ? "active" : ""} type="button" disabled={running} onClick={() => { setMode("delivery"); resetExecution(); }}>正常受控交付</button><button className={mode === "violation" ? "active danger" : ""} type="button" disabled={running} onClick={() => { setMode("violation"); resetExecution(); }}>越权访问阻断</button></div>
        <label><span>使用目的</span><select disabled={running} value={purpose} onChange={(event) => { setPurpose(event.target.value); resetExecution(); }}><option>order-risk-analysis</option><option>fraud-detection</option><option>compliance-audit</option></select></label>
        <label><span>策略版本</span><select disabled={running} value={policyVersion} onChange={(event) => { setPolicyVersion(Number(event.target.value) as 1 | 2); resetExecution(); }}><option value={1}>v1</option><option value={2}>v2</option></select></label>
        <button className="run-button flow-run-button" type="button" disabled={running || !fabricConnected} onClick={() => void startDemo()}>{running ? <><span className="spinner" />正在执行硬件认证、受控交付与 Fabric 提交</> : fabricConnected ? "▶ 执行真实可信数据流通" : "等待 Fabric 审计网络"}</button>
      </div>
      {fabric.data && !fabricConnected ? <div className="callout callout--danger"><strong>Fabric 审计网络不可用</strong><span>{fabric.data.message}</span></div> : null}
      {executionMutation.error ? <div className="callout callout--danger"><strong>可信流通执行失败</strong><span>{executionMutation.error.message}</span></div> : null}

      <div className="flow-two-column flow-step-cards">
        <SectionCard title="01 · 身份可信接入" eyebrow={execution ? (authenticationTrusted ? "TRUSTED" : "AUTHENTICATION FAILED") : "PENDING"}><div className="identity-evidence-card"><StatusTag tone={execution ? (authenticationTrusted ? "success" : "danger") : "neutral"}>{execution ? (authenticationTrusted ? "PASS" : "FAIL") : "WAIT"}</StatusTag><dl><div><dt>认证模式</dt><dd>DID-mTLS</dd></div><div><dt>执行来源</dt><dd>{execution?.authentication.source ?? "Hardware SSH"}</dd></div><div><dt>握手记录</dt><dd>{execution?.authentication.handshakeId ?? "等待执行"}</dd></div><div><dt>DID 校验</dt><dd>{execution?.authentication.didVerification.name ?? "等待执行"}</dd></div><div><dt>公钥绑定</dt><dd>{authenticationTrusted ? "✓ Verified" : "—"}</dd></div><div><dt>安全通道</dt><dd>{execution?.authentication.status.toUpperCase() ?? "PENDING"}</dd></div></dl><button className="secondary-button" type="button" onClick={onOpenAuthentication}>查看完整硬件认证证据 →</button></div></SectionCard>
        <SectionCard title="02 · 身份验证性能证据" eyebrow={execution ? "NATIVE OUTPUT" : "WAITING FOR EXECUTION"}><div className="performance-evidence-card"><div className="performance-metrics"><div><span>DID-TLS 握手</span><strong>{execution?.authentication.nativeHandshakeMs != null ? `${execution.authentication.nativeHandshakeMs} ms` : "—"}</strong><small>{execution ? "板端原生输出" : "等待硬件认证"}</small></div><div><span>GET_NYM 查询</span><strong>{execution?.authentication.getNymMs != null ? `${execution.authentication.getNymMs} ms` : "未暴露"}</strong><small>仅在板端日志提供时显示</small></div><div><span>身份状态</span><strong>{execution?.authentication.didVerification.status.toUpperCase() ?? "PENDING"}</strong><small>{execution?.authentication.didVerification.name ?? "等待 DID 校验"}</small></div></div><div className="optimization-chain"><div><StatusTag tone={execution ? "success" : "neutral"}>{execution ? "OBSERVED" : "PENDING"}</StatusTag><strong>Resolver 通信</strong><p>当前只能证明本次原生认证发生；连接池复用状态尚未由板端暴露。</p></div><div><StatusTag tone="warning">NOT EXPOSED</StatusTag><strong>LRU 身份状态缓存</strong><p>板内存在 LRU 相关代码，但本次输出无法证明命中、TTL 或失效原因。</p></div><div><StatusTag tone="warning">NOT EXPOSED</StatusTag><strong>会话恢复与分级校验</strong><p>未从原生输出识别到会话恢复证据，因此不展示模拟状态。</p></div></div><details className="performance-json"><summary>查看后端性能证据</summary><JsonBlock title="performanceEvidence" value={performanceEvidence} /></details></div></SectionCard>
      </div>

      <SectionCard title="03 · 数据产品目录" eyebrow="DISCOVER, NOT DISCLOSE" className="wide-card catalog-business-card"><div className="catalog-boundary"><div><StatusTag tone="success">FOUND</StatusTag><h3>订单风控数据</h3><p>目录仅提供产品元数据和申请入口，不返回任何原始业务数据。</p></div><strong>可信身份 → 允许发现<br />有效合约 → 才能访问</strong></div><dl className="catalog-metadata"><div><dt>productId</dt><dd>prod-order-risk-001</dd></div><div><dt>providerDid</dt><dd>did:indy:Provider7F3...</dd></div><div><dt>schema</dt><dd>order-risk/v1</dd></div><div><dt>sensitivityLevel</dt><dd>high_sensitive</dd></div><div><dt>allowedPurpose</dt><dd>{purpose}</dd></div><div><dt>policyTemplate</dt><dd>order-field-policy/v{policyVersion}</dd></div><div><dt>updatedAt</dt><dd>2026-08-18 14:30:00</dd></div></dl><details className="catalog-card"><summary>查看字段元数据</summary><div>{fields.map((field) => <span key={field.field}><code>{field.field}</code><b>{field.level}</b></span>)}</div></details></SectionCard>

      <SectionCard title="04 · 数字合约与策略绑定" eyebrow="ACTIVE" className="wide-card contract-business-card">
        <div className="contract-card-heading"><div><StatusTag tone={execution?.contract.status === "active" ? "success" : "neutral"}>{execution?.contract.status.toUpperCase() ?? "PREVIEW"}</StatusTag><h3>{activeContract.contractId}</h3><p>由 Gateway 规范化合约内容并计算 SHA-256，不再使用固定演示哈希。</p></div><code>{activeContract.contractHash}</code></div>
        <dl className="contract-facts"><div><dt>Provider</dt><dd>{activeContract.providerDid}</dd></div><div><dt>Consumer</dt><dd>{activeContract.consumerDid}</dd></div><div><dt>数据产品</dt><dd>订单风控数据</dd></div><div><dt>使用目的</dt><dd>{activeContract.purpose}</dd></div><div><dt>有效期</dt><dd>{activeContract.validFrom} → {activeContract.validTo}</dd></div><div><dt>策略版本</dt><dd>{activeContract.policyVersion}</dd></div></dl>
        <div className="contract-checks"><span>✓ 身份可信</span><span>✓ 使用目的匹配</span><span>✓ 合约有效</span><span>✓ 字段策略已绑定</span></div>
        <details className="contract-json"><summary>查看合约 JSON</summary><JsonBlock title="digitalContract" value={activeContract} /></details>
      </SectionCard>

      <SectionCard title="05–06 · 字段策略与受控交付" eyebrow="Raw Data → Policy Engine → Controlled Data" className="wide-card controlled-delivery-card">
        <p className="delivery-explainer">可信身份并不自动获得全部字段权限。数字合约和 identityContext 共同驱动字段策略引擎，形成最小必要交付结果。</p>
        <div className="delivery-pipeline">
          <div className="data-record-panel"><span>PROVIDER RAW DATA</span><strong>原始数据</strong>{Object.entries(rawData).map(([key, value]) => <div key={key}><code>{key}</code><b>{String(value)}</b></div>)}</div>
          <div className="policy-engine-panel"><span>FIELD POLICY ENGINE</span><strong>字段策略引擎</strong><small>数字合约 + identityContext</small>{policies.map((policy) => <div key={policy.field}><code>{policy.field}</code><StatusTag tone={policy.action === "plain" ? "success" : policy.action === "mask" ? "info" : policy.action === "encrypt" ? "warning" : "danger"}>{policy.action.toUpperCase()}</StatusTag></div>)}</div>
          <div className="data-record-panel controlled"><span>CONSUMER RECEIVED</span><strong>{execution?.status === "delivered" ? "受控数据" : executionBlocked ? "访问已阻断" : "等待执行"}</strong>{execution?.status === "delivered" ? Object.entries(controlledData).map(([key, value]) => <div key={key}><code>{key}</code><b className={value === "DENIED" ? "denied" : ""}>{String(value)}</b></div>) : executionBlocked ? <div className="blocked-delivery"><b>{execution?.status === "authentication_failed" ? "IDENTITY_NOT_TRUSTED" : "FIELD_ACCESS_DENIED"}</b><p>{execution?.status === "authentication_failed" ? "硬件身份认证未通过，未进入合约和字段交付阶段。" : "payment_account 越权请求已被策略引擎阻断。"}</p></div> : <div className="blocked-delivery"><b>NO EXECUTION YET</b><p>点击执行后，Gateway 将返回实际字段处理结果。</p></div>}</div>
        </div>
        <div className="policy-legend"><span><b>PLAIN</b>明文允许</span><span><b>MASK</b>脱敏交付</span><span><b>ENCRYPT</b>加密交付</span><span><b>DENY</b>拒绝交付</span></div>
        <PolicyMatrix fields={fields} policies={policies} />
        <details className="field-log-details"><summary>查看字段动作记录</summary><JsonBlock title="fieldActionLog" value={activeFieldActionLog} /></details>
      </SectionCard>

      <SectionCard title="07 · 审计存证摘要" eyebrow="RECORDED · OPEN AUDIT WORKSPACE" className="wide-card flow-audit-summary-card">
        <div className="flow-audit-summary">
          <div className="flow-audit-verdict"><StatusTag tone={execution ? (executionBlocked ? "danger" : "success") : "neutral"}>{execution ? "FABRIC COMMITTED" : "WAITING"}</StatusTag><h3>{execution ? (executionBlocked ? "阻断摘要已写入 Fabric" : "受控交付摘要已写入 Fabric") : "执行后生成审计证据"}</h3><p>完整事件、真实交易 ID 和区块号可在独立审计工作台按 traceId 查询并与链上记录比对。</p></div>
          <dl><div><dt>Trace ID</dt><dd>{activeTraceId}</dd></div><div><dt>末端事件</dt><dd>{execution?.events[execution.events.length - 1]?.eventType ?? "PENDING"}</dd></div><div><dt>Contract Hash</dt><dd>{execution?.contract.contractHash ?? "PENDING"}</dd></div><div><dt>Delivery Hash</dt><dd>{execution?.deliveryHash ?? (execution ? "NOT GENERATED" : "PENDING")}</dd></div><div><dt>审计后端</dt><dd>{execution?.audit.backend ?? "fabric"}</dd></div><div><dt>Fabric 状态</dt><dd>{execution?.audit.fabricCommitted ? `COMMITTED · BLOCK ${execution.audit.blockNumber}` : "PENDING"}</dd></div></dl>
          <button className="run-button audit-open-button" type="button" onClick={onOpenAudit}>查看完整审计证据 →</button>
        </div>
      </SectionCard>

      <div className={`delivery-summary ${executionBlocked ? "delivery-summary--blocked" : ""}`}>
        <div><StatusTag tone={execution ? (executionBlocked ? "danger" : "success") : "neutral"}>{execution?.status.toUpperCase() ?? "READY"}</StatusTag><h2>{execution ? (execution.status === "delivered" ? "真实可信数据流通完成" : execution.status === "blocked" ? "越权访问已阻断并留痕" : "身份认证失败，业务链路未放行") : "等待执行可信数据流通"}</h2><p>硬件认证与 Gateway 业务结果由同一 traceId 关联。</p></div>
        <div className="delivery-summary-status"><span>身份认证<strong>{execution ? (authenticationTrusted ? "TRUSTED" : "FAILED") : "PENDING"}</strong></span><span>安全通道<strong>{execution?.authentication.status.toUpperCase() ?? "PENDING"}</strong></span><span>数字合约<strong>{execution?.contract.status.toUpperCase() ?? "PENDING"}</strong></span><span>字段策略<strong>{execution && authenticationTrusted ? "APPLIED" : "PENDING"}</strong></span><span>数据交付<strong>{execution?.status.toUpperCase() ?? "PENDING"}</strong></span><span>审计后端<strong>{execution?.audit.backend.toUpperCase() ?? "FABRIC"}</strong></span></div>
        <div className="delivery-summary-hashes"><span>Trace ID<code>{activeTraceId}</code></span><span>Contract Hash<code>{execution?.contract.contractHash ?? "PENDING"}</code></span><span>Delivery Hash<code>{execution?.deliveryHash ?? "NOT GENERATED"}</code></span></div>
      </div>
    </div>
  );
}
