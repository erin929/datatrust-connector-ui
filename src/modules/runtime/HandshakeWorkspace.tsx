import { useState, type FormEvent } from "react";
import type { AuthMode, HandshakeRequest, HandshakeResult, RuntimeInfo, RuntimePreflight } from "../../../shared/runtime-contract";
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
  preflight?: RuntimePreflight;
  running: boolean;
  error?: Error;
  onRun: (request: HandshakeRequest) => Promise<HandshakeResult>;
};

export function HandshakeWorkspace({ runtime, preflight, running, error, onRun }: Props) {
  const [authMode, setAuthMode] = useState<AuthMode>("traditional");
  const [mutualTls, setMutualTls] = useState(false);
  const [timeoutMs, setTimeoutMs] = useState(15000);

  const backendReady = runtime.backend.status === "ready";
  const autoUnsupported = authMode === "auto" && !runtime.backend.capabilities.autoMode;
  const clientProfileMissing =
    mutualTls &&
    (runtime.backend.transport === "ssh" || authMode !== "traditional") &&
    !runtime.backend.certificateProfiles.did.configured;
  const didServerProfileMissing =
    authMode !== "traditional" &&
    runtime.backend.server.mode !== "external" &&
    !runtime.backend.certificateProfiles.serverDid.configured;
  const indyLedgerMissing = authMode !== "traditional" && !runtime.backend.indyLedger.configured;
  const boardChecks = preflight?.checks.filter(
    (check) => check.id === "server_board" || check.id === "client_board",
  );
  const hardwareBoardsReady =
    runtime.backend.transport !== "ssh" ||
    (boardChecks?.length === 2 && boardChecks.every((check) => check.status === "ready"));
  const ledgerPreflightFailed =
    authMode !== "traditional" &&
    preflight?.checks.some(
      (check) => check.id === "indy_ledger" && check.status !== "ready",
    );
  const disabled =
    running ||
    !backendReady ||
    autoUnsupported ||
    clientProfileMissing ||
    didServerProfileMissing ||
    indyLedgerMissing;
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
      <SectionCard title="连接认证执行" eyebrow="POST /api/handshakes" className="control-card">
        <form onSubmit={submit}>
          <fieldset className="mode-fieldset">
            <legend>认证模式</legend>
            <div className="mode-options">
              {MODES.map((mode) => (
                <label className={authMode === mode.id ? "mode-option mode-option--active" : "mode-option"} key={mode.id}>
                  <input type="radio" name="auth-mode" value={mode.id} checked={authMode === mode.id} disabled={mode.id === "auto" && !runtime.backend.capabilities.autoMode} onChange={() => setAuthMode(mode.id)} />
                  <span><strong>{mode.title}</strong><small>{mode.id === "auto" && !runtime.backend.capabilities.autoMode ? "最新板卡程序没有与旧 Auto 等价的模式。" : mode.description}</small></span>
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
            <div><span>{runtime.backend.transport === "ssh" ? "板卡22编译目标" : "原生客户端目标"}</span><strong>{runtime.backend.target.host}:{runtime.backend.target.port}</strong></div>
            <StatusTag tone={backendReady && hardwareBoardsReady ? "success" : "warning"}>{backendReady && hardwareBoardsReady ? runtime.backend.status : "hardware unavailable"}</StatusTag>
          </div>
          {!backendReady ? <div className="callout callout--warning">{runtime.backend.reason}</div> : null}
          {!hardwareBoardsReady ? <div className="callout callout--warning">板卡21或板卡22预检尚未通过。按钮仍允许发起真实尝试；若硬件确实不可达，Gateway 会返回对应 SSH 错误。</div> : null}
          {autoUnsupported ? <div className="callout callout--warning">硬件版 tls_client/tls_server 只对齐 Traditional TLS 和 DID-TLS；Gateway 不会把 --fallback 冒充成旧 Auto。</div> : null}
          {clientProfileMissing ? <div className="callout callout--warning">当前板卡程序的双向认证需要配置远程客户端证书和私钥路径；关闭双向认证仍可验证服务器 DID。</div> : null}
          {didServerProfileMissing ? <div className="callout callout--warning">托管 DID / Auto 服务器需要配置 HITLS_SERVER_DID_CERT 和 HITLS_SERVER_DID_KEY。</div> : null}
          {indyLedgerMissing ? <div className="callout callout--warning">DID / Auto 需要真实 Indy 账本 Genesis；请检查 {runtime.backend.transport === "ssh" ? "HITLS_REMOTE_GENESIS_PATH" : "INDY_GENESIS_PATH"}。</div> : null}
          {ledgerPreflightFailed ? <div className="callout callout--warning">Indy 端口预检未通过；仍可查看配置，但 DID 握手不能被认定为链上成功，建议先修复账本网络。</div> : null}
          {apiError ? <div className="callout callout--danger"><strong>{apiError.code}</strong><span>{apiError.message}</span></div> : error ? <div className="callout callout--danger">{error.message}</div> : null}
          <button className="run-button" type="submit" disabled={disabled}>{running ? <><span className="spinner" />认证策略执行中</> : runtime.backend.transport === "ssh" ? "通过 SSH 执行连接认证" : "执行 openHiTLS 连接认证"}</button>
          <p className="safety-note">Gateway 只使用固定的板卡、程序和证书配置；浏览器不能提交 SSH 命令或可执行路径。</p>
        </form>
      </SectionCard>
    </div>
  );
}
