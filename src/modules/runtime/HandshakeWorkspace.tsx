import { useState, type FormEvent } from "react";
import type { AuthMode, HandshakeRequest, RuntimeInfo } from "../../../shared/runtime-contract";
import { SectionCard } from "../../shared/components/ui/SectionCard";
import { StatusTag } from "../../shared/components/ui/StatusTag";
import { ApiRequestError } from "../../shared/services/runtime-api";

const MODES: { id: AuthMode; title: string; description: string }[] = [
  { id: "traditional", title: "Traditional TLS", description: "只执行传统 PKI 证书链验证。" },
  { id: "did", title: "DID-TLS", description: "要求 DID 证书并执行 Indy 链上公钥验证。" },
  { id: "auto", title: "Auto", description: "由原生 openHiTLS 扩展协商认证模式。" },
];

type Props = {
  runtime: RuntimeInfo;
  running: boolean;
  error?: Error;
  onRun: (request: HandshakeRequest) => Promise<void>;
};

export function HandshakeWorkspace({ runtime, running, error, onRun }: Props) {
  const [authMode, setAuthMode] = useState<AuthMode>("traditional");
  const [mutualTls, setMutualTls] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState(15000);

  const backendReady = runtime.backend.status === "ready";
  const didProfileMissing = authMode !== "traditional" && mutualTls && !runtime.backend.certificateProfiles.did.configured;
  const disabled = running || !backendReady || didProfileMissing;
  const apiError = error instanceof ApiRequestError ? error : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    try {
      await onRun({ authMode, mutualTls, timeoutMs });
    } catch {
      // useSWRMutation keeps the structured error for the callout below.
    }
  };

  return (
    <div className="handshake-layout">
      <SectionCard title="发起真实握手" eyebrow="POST /api/handshakes" className="control-card">
        <form onSubmit={submit}>
          <fieldset className="mode-fieldset">
            <legend>认证模式</legend>
            <div className="mode-options">
              {MODES.map((mode) => (
                <label className={authMode === mode.id ? "mode-option mode-option--active" : "mode-option"} key={mode.id}>
                  <input type="radio" name="auth-mode" value={mode.id} checked={authMode === mode.id} onChange={() => setAuthMode(mode.id)} />
                  <span><strong>{mode.title}</strong><small>{mode.description}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="form-row">
            <label className="switch-row">
              <span><strong>双向认证</strong><small>开启后客户端也会发送证书。</small></span>
              <input type="checkbox" checked={mutualTls} onChange={(event) => setMutualTls(event.target.checked)} />
            </label>
            <label className="input-row">
              <span>超时时间</span>
              <div><input type="number" min="1000" max="120000" step="1000" value={timeoutMs} onChange={(event) => setTimeoutMs(Number(event.target.value))} /><small>ms</small></div>
            </label>
          </div>
          <div className="target-box">
            <div><span>原生客户端目标</span><strong>{runtime.backend.target.host}:{runtime.backend.target.port}</strong></div>
            <StatusTag tone={backendReady ? "success" : "warning"}>{runtime.backend.status}</StatusTag>
          </div>
          {!backendReady ? <div className="callout callout--warning">{runtime.backend.reason}</div> : null}
          {didProfileMissing ? <div className="callout callout--warning">DID / Auto 的双向认证需要配置 HITLS_DID_CERT 和 HITLS_DID_KEY；关闭双向认证仍可验证服务器 DID。</div> : null}
          {apiError ? <div className="callout callout--danger"><strong>{apiError.code}</strong><span>{apiError.message}</span></div> : error ? <div className="callout callout--danger">{error.message}</div> : null}
          <button className="run-button" type="submit" disabled={disabled}>{running ? <><span className="spinner" />原生握手执行中</> : "执行 openHiTLS 握手"}</button>
          <p className="safety-note">Gateway 使用固定后端配置启动进程，浏览器不能提交可执行路径或任意命令。</p>
        </form>
      </SectionCard>
    </div>
  );
}
