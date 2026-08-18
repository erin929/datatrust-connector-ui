import { useState } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { HandshakeRequest, HandshakeResult } from "../../../shared/runtime-contract";
import type { HandshakeScenario } from "../../../shared/runtime-contract";
import { StatusTag } from "../../shared/components/ui/StatusTag";
import { getFabricAuditStatus, getHandshakeHistory, getPreflight, getRuntime, postHandshake } from "../../shared/services/runtime-api";
import { HandshakeHistory } from "./HandshakeHistory";
import { RuntimeOverview } from "./RuntimeOverview";
import { SecurityValidation } from "./SecurityValidation";
import { TrustedFlowDemo } from "../trusted-flow/TrustedFlowDemo";
import { AuditTraceDemo } from "../trusted-flow/AuditTraceDemo";

type View = "runtime" | "verification" | "flow" | "audit" | "history";

const VIEWS: { id: View; label: string; caption: string }[] = [
  { id: "runtime", label: "运行状态", caption: "Gateway、板卡与 Indy" },
  { id: "verification", label: "身份认证与互信验证", caption: "六类认证与安全实验" },
  { id: "flow", label: "可信数据流通", caption: "目录、合约与字段受控交付" },
  { id: "audit", label: "审计追溯", caption: "Fabric 存证与 traceId 证据链" },
  { id: "history", label: "认证日志", caption: "错误码与原生日志" },
];

export function RuntimeConsole() {
  const [view, setView] = useState<View>("flow");
  const [selectedResult, setSelectedResult] = useState<HandshakeResult | null>(null);
  const [verificationScenario, setVerificationScenario] = useState<HandshakeScenario | undefined>();
  const runtime = useSWR("/api/runtime", getRuntime, { refreshInterval: 5000 });
  const preflight = useSWR("/api/preflight", getPreflight, { revalidateOnFocus: false });
  const history = useSWR("/api/handshakes", getHandshakeHistory);
  const fabric = useSWR("/api/trusted-flow/fabric/status", getFabricAuditStatus, { refreshInterval: 5000 });
  const mutation = useSWRMutation("/api/handshakes", postHandshake);

  const runHandshake = async (request: HandshakeRequest) => {
    const result = await mutation.trigger(request);
    setSelectedResult(result);
    await history.mutate(
      (current) => ({ items: [result, ...(current?.items ?? []).filter((item) => item.id !== result.id)] }),
      { revalidate: false },
    );
    return result;
  };

  const selectHistory = (result: HandshakeResult) => {
    setVerificationScenario(undefined);
    setSelectedResult(result);
    setView("verification");
  };

  const gatewayOnline = Boolean(runtime.data);
  const backendReady = runtime.data?.backend.status === "ready";
  const fabricConnected = fabric.data?.connected === true;

  return (
    <div className="shell enterprise-shell">
      <aside className="sidebar enterprise-sidebar">
        <div className="brand enterprise-brand">
          <span>TrustGate-DID</span>
          <strong>DataTrust Platform</strong>
          <small>真实可信数据连接器运营平台</small>
        </div>
        <div className="side-section-title">工作台视角</div>
        <nav className="workspace-nav" aria-label="主导航">
          {VIEWS.map((item) => (
            <button type="button" className={view === item.id ? "active" : ""} key={item.id} onClick={() => setView(item.id)}>
              <strong>{item.label}</strong><span>{item.caption}</span>
            </button>
          ))}
        </nav>
        <div className="side-health-card">
          <div><span className={gatewayOnline ? "pulse-dot" : "pulse-dot pulse-dot--offline"} /><strong>Connector Gateway</strong></div>
          <p>{gatewayOnline ? "API 已连接；页面展示 Gateway、板卡与 openHiTLS 的真实输出。" : "正在连接 Connector Gateway。"}</p>
        </div>
      </aside>

      <main className="main enterprise-main">
        <header className="topbar enterprise-topbar">
          <div><h1>{VIEWS.find((item) => item.id === view)?.label}</h1></div>
          <div className="topbar__status">{view === "flow" || view === "audit" ? <><StatusTag tone={gatewayOnline ? "success" : "danger"}>Gateway {gatewayOnline ? "online" : "offline"}</StatusTag><StatusTag tone={fabricConnected ? "success" : fabric.data ? "danger" : "warning"}>Fabric {fabricConnected ? "connected" : fabric.data ? "unavailable" : "checking"}</StatusTag></> : <><StatusTag tone={gatewayOnline ? "success" : "danger"}>Gateway {gatewayOnline ? "online" : "offline"}</StatusTag><StatusTag tone={backendReady ? "success" : "warning"}>Native {runtime.data?.backend.status ?? "unknown"}</StatusTag>{runtime.data?.backend.transport === "ssh" ? <StatusTag tone={preflight.data?.status === "ready" ? "success" : preflight.data?.status === "unavailable" ? "danger" : "warning"}>Hardware {preflight.data?.status ?? "checking"}</StatusTag> : null}</>}</div>
        </header>

        {view === "flow" ? <TrustedFlowDemo onOpenAuthentication={() => { setVerificationScenario("did_mtls"); setView("verification"); }} onOpenAudit={() => setView("audit")} /> : view === "audit" ? <AuditTraceDemo onOpenFlow={() => setView("flow")} /> : runtime.error ? (
          <div className="fatal-state"><strong>Gateway 不可用</strong><p>{runtime.error.message}</p><button type="button" onClick={() => runtime.mutate()}>重新连接</button></div>
        ) : !runtime.data ? (
          <div className="loading-state"><span className="spinner spinner--dark" />正在读取真实运行状态…</div>
        ) : (
          <>
            {view === "runtime" ? <RuntimeOverview runtime={runtime.data} preflight={preflight.data} preflightLoading={preflight.isLoading || preflight.isValidating} preflightError={preflight.error} onRefreshPreflight={() => void preflight.mutate()} /> : null}
            {view === "verification" ? <SecurityValidation key={verificationScenario ?? "default"} initialScenario={verificationScenario} runtime={runtime.data} preflight={preflight.data} running={mutation.isMutating} error={mutation.error} selectedResult={selectedResult} onRun={runHandshake} /> : null}
            {view === "history" ? <HandshakeHistory items={history.data?.items ?? []} onSelect={selectHistory} /> : null}
          </>
        )}
      </main>
    </div>
  );
}
