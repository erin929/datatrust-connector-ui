import { useState } from "react";
import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import type { HandshakeRequest, HandshakeResult } from "../../../shared/runtime-contract";
import { StatusTag } from "../../shared/components/ui/StatusTag";
import { getHandshakeHistory, getRuntime, postHandshake } from "../../shared/services/runtime-api";
import { HandshakeHistory } from "./HandshakeHistory";
import { HandshakeResultPanel } from "./HandshakeResultPanel";
import { HandshakeWorkspace } from "./HandshakeWorkspace";
import { RuntimeOverview } from "./RuntimeOverview";

type View = "runtime" | "handshake" | "history";

const VIEWS: { id: View; label: string; caption: string }[] = [
  { id: "runtime", label: "运行状态", caption: "Gateway 与原生后端" },
  { id: "handshake", label: "真实握手", caption: "执行 unified client" },
  { id: "history", label: "结果历史", caption: "错误码与原生日志" },
];

export function RuntimeConsole() {
  const [view, setView] = useState<View>("runtime");
  const [selectedResult, setSelectedResult] = useState<HandshakeResult | null>(null);
  const runtime = useSWR("/api/runtime", getRuntime, { refreshInterval: 5000 });
  const history = useSWR("/api/handshakes", getHandshakeHistory);
  const mutation = useSWRMutation("/api/handshakes", postHandshake);

  const runHandshake = async (request: HandshakeRequest) => {
    const result = await mutation.trigger(request);
    setSelectedResult(result);
    await history.mutate(
      (current) => ({ items: [result, ...(current?.items ?? []).filter((item) => item.id !== result.id)] }),
      { revalidate: false },
    );
  };

  const selectHistory = (result: HandshakeResult) => {
    setSelectedResult(result);
    setView("handshake");
  };

  const gatewayOnline = Boolean(runtime.data);
  const backendReady = runtime.data?.backend.status === "ready";

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
          <p>{gatewayOnline ? "API 已连接；页面展示 Gateway 与 openHiTLS 的真实输出。" : "正在连接本地 Gateway。"}</p>
        </div>
      </aside>

      <main className="main enterprise-main">
        <header className="topbar enterprise-topbar">
          <div><p>Gateway → openHiTLS → Indy VDR → 真实握手结果</p><h1>{VIEWS.find((item) => item.id === view)?.label}</h1><span>证书模式、握手结果与 DID_VerifyResult 使用后端真实输出。</span></div>
          <div className="topbar__status"><StatusTag tone={gatewayOnline ? "success" : "danger"}>Gateway {gatewayOnline ? "online" : "offline"}</StatusTag><StatusTag tone={backendReady ? "success" : "warning"}>Native {runtime.data?.backend.status ?? "unknown"}</StatusTag></div>
        </header>

        {runtime.error ? (
          <div className="fatal-state"><strong>Gateway 不可用</strong><p>{runtime.error.message}</p><button type="button" onClick={() => runtime.mutate()}>重新连接</button></div>
        ) : !runtime.data ? (
          <div className="loading-state"><span className="spinner spinner--dark" />正在读取真实运行状态…</div>
        ) : (
          <>
            {view === "runtime" ? <RuntimeOverview runtime={runtime.data} /> : null}
            {view === "handshake" ? <div className="workspace-grid"><HandshakeWorkspace runtime={runtime.data} running={mutation.isMutating} error={mutation.error} onRun={runHandshake} /><HandshakeResultPanel result={selectedResult} /></div> : null}
            {view === "history" ? <HandshakeHistory items={history.data?.items ?? []} onSelect={selectHistory} /> : null}
          </>
        )}
      </main>
    </div>
  );
}
