import { useMemo, useState } from "react";
import useSWR from "swr";
import type { FabricAuditRecord, TrustedFlowExecution, TrustedFlowStatus } from "../../../shared/trusted-flow-contract";
import { JsonBlock } from "../../shared/components/business/JsonBlock";
import { SectionCard } from "../../shared/components/ui/SectionCard";
import { StatusTag } from "../../shared/components/ui/StatusTag";
import { getFabricAuditRecord, getFabricAuditStatus, getTrustedFlowTraces } from "../../shared/services/runtime-api";

const eventCatalog = ["ConnectorRegistered", "IdentityVerified", "ProductPublished", "DataAccessRequested", "ContractActivated", "PolicyUpdated", "DataDelivered", "ViolationDetected", "AuditCommitted"] as const;

function statusTone(status: TrustedFlowStatus) {
  return status === "delivered" ? "success" : "danger";
}

function statusLabel(status: TrustedFlowStatus) {
  if (status === "delivered") return "DELIVERED";
  if (status === "blocked") return "BLOCKED";
  return "AUTH FAILED";
}

export function AuditTraceDemo({ onOpenFlow }: { onOpenFlow: () => void }) {
  const traces = useSWR("/api/trusted-flow/traces", getTrustedFlowTraces, { refreshInterval: 3000 });
  const fabric = useSWR("/api/trusted-flow/fabric/status", getFabricAuditStatus, { refreshInterval: 5000 });
  const [selectedTraceId, setSelectedTraceId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TrustedFlowStatus>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [fabricRecord, setFabricRecord] = useState<FabricAuditRecord | null>(null);
  const [verificationError, setVerificationError] = useState("");
  const [verifying, setVerifying] = useState(false);

  const items = traces.data?.items ?? [];
  const visibleTraces = useMemo(() => items.filter((trace) => statusFilter === "all" || trace.status === statusFilter), [items, statusFilter]);
  const selected = items.find((trace) => trace.traceId === selectedTraceId) ?? visibleTraces[0] ?? null;
  const visibleEvents = selected?.events.filter((event) => eventFilter === "all" || event.eventType === eventFilter) ?? [];

  const chooseTrace = (trace: TrustedFlowExecution) => {
    setSelectedTraceId(trace.traceId);
    setQuery(trace.traceId);
    setEventFilter("all");
    setFabricRecord(null);
    setVerificationError("");
  };

  const searchTrace = () => {
    const normalized = query.trim().toLowerCase();
    const match = items.find((trace) => trace.traceId.toLowerCase() === normalized);
    if (match) chooseTrace(match);
  };

  const verifyOnFabric = async () => {
    if (!selected) return;
    setVerifying(true);
    setVerificationError("");
    try {
      setFabricRecord(await getFabricAuditRecord(`/api/trusted-flow/fabric/audits/${encodeURIComponent(selected.traceId)}`));
    } catch (error) {
      setFabricRecord(null);
      setVerificationError(error instanceof Error ? error.message : String(error));
    } finally {
      setVerifying(false);
    }
  };

  const recordMatches = Boolean(
    selected &&
      fabricRecord?.traceId === selected.traceId &&
      fabricRecord.contractHash === selected.contract.contractHash &&
      fabricRecord.deliveryHash === selected.deliveryHash &&
      fabricRecord.policyVersion === selected.contract.policyVersion &&
      fabricRecord.fabricTxId === selected.audit.transactionId,
  );

  return (
    <div className="audit-trace-page">
      <div className="demo-disclosure"><div><StatusTag tone={fabric.data?.connected ? "success" : "warning"}>{fabric.data?.connected ? "FABRIC CONNECTED" : "FABRIC UNAVAILABLE"}</StatusTag><strong>可信流通审计工作台</strong></div><p>页面读取 Gateway 实际产生的 trace、哈希与事件，并按 traceId 查询 Fabric 链码，核验真实交易 ID、区块号和链上摘要。</p></div>

      <SectionCard title="审计任务检索" eyebrow="TRACE ID AS THE PRIMARY INDEX" className="wide-card audit-search-card">
        <div className="audit-search-row"><label><span>输入完整 Trace ID</span><div><input value={query} placeholder="先在可信数据流通页面执行一条链路" onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") searchTrace(); }} /><button type="button" onClick={searchTrace}>查询证据链</button></div></label><div className="audit-search-hint"><span>Gateway 本次会话保存 {items.length} 条索引</span><strong>Fabric 链上摘要独立持久化，可通过 traceId 重新查询。</strong></div></div>
      </SectionCard>

      {!selected ? <SectionCard title="暂无审计记录" eyebrow="NO GATEWAY TRACE" className="wide-card"><div className="empty-state compact-empty"><span>◎</span><h3>请先执行一条可信数据流通链路</h3><p>Gateway 会真实调用硬件完成 DID-mTLS 认证，执行字段策略，并将摘要提交到 Fabric。</p><button className="secondary-button" type="button" onClick={onOpenFlow}>前往可信数据流通 →</button></div></SectionCard> : <>
        <div className="audit-workspace-grid">
          <SectionCard title="审计记录" eyebrow="GATEWAY TRACE INDEX" className="audit-index-card">
            <div className="audit-filter-tabs"><button type="button" className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>全部</button><button type="button" className={statusFilter === "delivered" ? "active" : ""} onClick={() => setStatusFilter("delivered")}>正常交付</button><button type="button" className={statusFilter === "blocked" ? "active danger" : ""} onClick={() => setStatusFilter("blocked")}>违规阻断</button></div>
            <div className="audit-trace-list">{visibleTraces.map((trace) => <button type="button" className={selected.traceId === trace.traceId ? "active" : ""} key={trace.traceId} onClick={() => chooseTrace(trace)}><div><StatusTag tone={statusTone(trace.status)}>{statusLabel(trace.status)}</StatusTag><time>{new Date(trace.finishedAt).toLocaleString()}</time></div><strong>{trace.product.name}</strong><code>{trace.traceId}</code><small>{trace.request.purpose}</small></button>)}</div>
            <button className="secondary-button audit-back-button" type="button" onClick={onOpenFlow}>← 返回可信数据流通</button>
          </SectionCard>

          <div className="audit-detail-column">
            <SectionCard title="审计结论" eyebrow="BACKEND VERDICT" className="audit-verdict-card">
              <div className={`audit-verdict audit-verdict--${selected.status === "delivered" ? "success" : "blocked"}`}><div><StatusTag tone={statusTone(selected.status)}>{statusLabel(selected.status)}</StatusTag><h3>{selected.status === "delivered" ? "字段级受控交付已完成并记录" : selected.status === "blocked" ? "越权访问已阻断并记录" : "硬件身份认证未通过，业务访问未放行"}</h3><p>{selected.traceId}</p></div><strong>{selected.status === "delivered" ? "PASS" : "BLOCK"}</strong></div>
              <dl className="audit-context-grid"><div><dt>数据产品</dt><dd>{selected.product.name}</dd></div><div><dt>使用目的</dt><dd>{selected.request.purpose}</dd></div><div><dt>数字合约</dt><dd>{selected.contract.contractId}</dd></div><div><dt>策略版本</dt><dd>{selected.contract.policyVersion}</dd></div><div><dt>硬件握手记录</dt><dd>{selected.authentication.handshakeId}</dd></div><div><dt>DID 校验</dt><dd>{selected.authentication.didVerification.name ?? selected.authentication.didVerification.status}</dd></div></dl>
            </SectionCard>

            <SectionCard title="全链路事件时间线" eyebrow="AUTHENTICATION → AUTHORIZATION → DELIVERY → AUDIT" className="audit-timeline-card">
              <div className="audit-event-filter"><button type="button" className={eventFilter === "all" ? "active" : ""} onClick={() => setEventFilter("all")}>全部事件</button>{eventCatalog.map((type) => <button type="button" className={eventFilter === type ? "active" : ""} key={type} onClick={() => setEventFilter(type)}>{type}</button>)}</div>
              <div className="audit-full-timeline">{visibleEvents.length ? visibleEvents.map((event) => <div key={`${event.sequence}-${event.eventType}`}><div className="audit-event-index"><span>{event.sequence}</span><i /></div><time>{new Date(event.timestamp).toLocaleTimeString()}</time><section><div><strong>{event.eventType}</strong><StatusTag tone={event.eventType === "ViolationDetected" || selected.status === "authentication_failed" && event.eventType === "IdentityVerified" ? "danger" : "success"}>{event.ledgerState.toUpperCase()}</StatusTag></div><p>{event.detail}</p><small>{event.actor}</small></section><code>{event.digest}</code></div>) : <p className="audit-no-events">当前链路没有该类型事件。</p>}</div>
            </SectionCard>
          </div>
        </div>

        <div className="audit-proof-grid">
          <SectionCard title="Fabric 审计回执" eyebrow="DUAL-ORG ENDORSED LEDGER" className="fabric-receipt-card"><div className="fabric-receipt-heading"><span>F</span><div><StatusTag tone={selected.audit.fabricCommitted ? "success" : "danger"}>{selected.audit.fabricCommitted ? "COMMITTED" : "FAILED"}</StatusTag><h3>双组织 Fabric 审计记录</h3></div></div><dl><div><dt>Backend</dt><dd>{selected.audit.backend}</dd></div><div><dt>Channel</dt><dd>{selected.audit.channel}</dd></div><div><dt>Chaincode</dt><dd>{selected.audit.chaincode}</dd></div><div><dt>Block Number</dt><dd>#{selected.audit.blockNumber ?? "—"}</dd></div><div><dt>Transaction ID</dt><dd>{selected.audit.transactionId ?? "—"}</dd></div><div><dt>Fabric Commit</dt><dd>{selected.audit.fabricCommitted ? "TRUE · VALID" : "FALSE"}</dd></div></dl><p>{selected.audit.notice}</p></SectionCard>

          <SectionCard title="链上摘要完整性检查" eyebrow="GATEWAY ↔ FABRIC CHAINCODE" className="hash-verification-card"><div className="hash-compare"><div><span>Gateway 合约摘要</span><code>{selected.contract.contractHash}</code></div><b>{recordMatches ? "✓" : "↔"}</b><div><span>Fabric 合约摘要</span><code>{fabricRecord?.contractHash ?? "等待链上查询"}</code></div><div><span>Gateway 交付摘要</span><code>{selected.deliveryHash ?? "未产生交付"}</code></div><b>{recordMatches ? "✓" : "↔"}</b><div><span>Fabric 交付摘要</span><code>{fabricRecord?.deliveryHash ?? (fabricRecord ? "未产生交付" : "等待链上查询")}</code></div></div><button className="run-button" type="button" disabled={verifying || !fabric.data?.connected} onClick={() => void verifyOnFabric()}>{verifying ? "正在查询 Fabric…" : "按 Trace ID 查询并核验链上摘要"}</button>{recordMatches ? <div className="hash-verified-result"><StatusTag tone="success">CHAIN VERIFIED</StatusTag><strong>traceId、交易 ID、合约摘要、交付摘要和策略版本均与 Fabric 链上记录一致。</strong></div> : fabricRecord ? <div className="callout callout--danger"><strong>链上数据不一致</strong><span>至少一个关键摘要或交易 ID 与 Gateway 回执不一致。</span></div> : verificationError ? <div className="callout callout--danger"><strong>链上查询失败</strong><span>{verificationError}</span></div> : <p>此操作会实际调用 Fabric 链码 GetAudit，不使用前端模拟数据。</p>}</SectionCard>
        </div>

        <SectionCard title="存证数据边界" eyebrow="SENSITIVE RAW DATA NEVER ENTERS THE AUDIT RECORD" className="wide-card audit-boundary-card"><div className="audit-boundary-grid"><div><StatusTag tone="success">写入 Fabric</StatusTag><strong>事件摘要与证明信息</strong><p>eventType · contractHash · policyVersion · deliveryHash · timestamp · traceId · status</p></div><div><StatusTag tone="danger">不写入 Fabric</StatusTag><strong>敏感数据原文</strong><p>身份证号 · 手机号 · 支付账户 · 原始字段值 · 明文数据集 · 解密密钥</p></div><details><summary>查看已查询的 Fabric 链上对象</summary>{fabricRecord ? <JsonBlock title="fabricAuditRecord" value={fabricRecord} /> : <p>点击“按 Trace ID 查询并核验链上摘要”后显示真实链上对象。</p>}</details></div></SectionCard>
      </>}
    </div>
  );
}
