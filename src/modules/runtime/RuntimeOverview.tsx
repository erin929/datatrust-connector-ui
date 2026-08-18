import type { RuntimeInfo, RuntimePreflight } from "../../../shared/runtime-contract";
import { SectionCard } from "../../shared/components/ui/SectionCard";
import { StatusTag } from "../../shared/components/ui/StatusTag";

function backendTone(status: RuntimeInfo["backend"]["status"]) {
  if (status === "ready") return "success" as const;
  if (status === "unavailable") return "danger" as const;
  return "warning" as const;
}

function checkTone(status: RuntimePreflight["checks"][number]["status"]) {
  if (status === "ready") return "success" as const;
  if (status === "unreachable") return "danger" as const;
  if (status === "misconfigured") return "warning" as const;
  return "neutral" as const;
}

type Props = {
  runtime: RuntimeInfo;
  preflight?: RuntimePreflight;
  preflightLoading: boolean;
  preflightError?: Error;
  onRefreshPreflight: () => void;
};

export function RuntimeOverview({
  runtime,
  preflight,
  preflightLoading,
  preflightError,
  onRefreshPreflight,
}: Props) {
  const { backend, gateway } = runtime;
  const hardwareMode = backend.transport === "ssh";

  return (
    <div className="content-grid runtime-overview">
      <SectionCard title="Connector Gateway" eyebrow="HTTP control plane">
        <div className="health-heading">
          <div className="health-icon health-icon--ready">G</div>
          <div><StatusTag tone="success">在线</StatusTag><h3>{hardwareMode ? "控制电脑 API 网关" : "本地 API 网关"}</h3></div>
        </div>
        <dl className="fact-list">
          <div><dt>版本</dt><dd>{gateway.version}</dd></div>
          <div><dt>启动时间</dt><dd>{new Date(gateway.startedAt).toLocaleString()}</dd></div>
          <div><dt>运行时长</dt><dd>{gateway.uptimeSeconds} 秒</dd></div>
          <div><dt>传输方式</dt><dd>{hardwareMode ? "SSH 双板卡" : "本机进程"}</dd></div>
        </dl>
      </SectionCard>

      <SectionCard title="openHiTLS 原生后端" eyebrow="Native data plane">
        <div className="health-heading">
          <div className={`health-icon health-icon--${backend.status}`}>H</div>
          <div><StatusTag tone={backendTone(backend.status)}>{backend.status}</StatusTag><h3>{backend.executableName ?? "未配置可执行文件"}</h3></div>
        </div>
        {backend.reason ? <div className="callout callout--warning">{backend.reason}</div> : null}
        <dl className="fact-list">
          <div><dt>固定目标</dt><dd>{hardwareMode ? "Board 21 TLS Server" : `本机端口 ${backend.target.port}`}</dd></div>
          <div><dt>适配器</dt><dd>{backend.adapter}</dd></div>
          <div><dt>原生服务器</dt><dd>{backend.server.mode === "ssh-managed" ? `板卡21 SSH 托管 · ${backend.server.executableName}` : backend.server.mode === "managed" ? `Gateway 托管 · ${backend.server.executableName ?? "未配置"}` : "外部运行"}</dd></div>
          <div><dt>客户端证书</dt><dd>{backend.certificateProfiles.did.configured ? "已配置" : "未配置"}</dd></div>
          <div><dt>服务器 DID 证书</dt><dd>{backend.certificateProfiles.serverDid.configured ? "已配置" : "未配置"}</dd></div>
          <div><dt>Indy 账本</dt><dd>{backend.indyLedger.host ? `${backend.indyLedger.host}:${backend.indyLedger.port}` : backend.indyLedger.genesisName ?? "未配置"}</dd></div>
        </dl>
      </SectionCard>

      {hardwareMode ? (
        <SectionCard title="硬件链路检测" eyebrow="SSH & network preflight" className="wide-card">
          <div className="preflight-heading">
            <div>
              <StatusTag tone={preflight?.status === "ready" ? "success" : preflight?.status === "unavailable" ? "danger" : "warning"}>
                {preflightLoading ? "checking" : preflight?.status ?? "unknown"}
              </StatusTag>
              <p>{preflight ? `最近检测：${new Date(preflight.checkedAt).toLocaleString()}` : "正在检测板卡与 Indy 节点。"}</p>
            </div>
            <button className="secondary-button" type="button" disabled={preflightLoading} onClick={onRefreshPreflight}>{preflightLoading ? "检测中…" : "重新检测"}</button>
          </div>
          {preflightError ? <div className="callout callout--danger">{preflightError.message}</div> : null}
          <div className="preflight-grid">
            {(preflight?.checks ?? []).map((check) => (
              <div className="preflight-item" key={check.id}>
                <div><strong>{check.label}</strong><StatusTag tone={checkTone(check.status)}>{check.status}</StatusTag></div>
                {check.id === "server_board" || check.id === "client_board" ? null : <code>{check.host}</code>}
                <p>{check.detail}</p>
                <small>{check.latencyMs === null ? "未测量延迟" : `${check.latencyMs} ms`}</small>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title="已对齐的真实能力" eyebrow="Capability contract" className="wide-card">
        <div className="capability-grid">
          <div><span>01</span><strong>双板卡控制</strong><p>{hardwareMode ? "Gateway 通过 SSH 分别启动板卡21服务端与板卡22客户端。" : "Gateway 启动本机 openHiTLS 原生进程。"}</p></div>
          <div><span>02</span><strong>Indy DID</strong><p>只有原生日志出现 GET_NYM 链上查询成功证据，页面才报告 DID 验证成功。</p></div>
          <div><span>03</span><strong>握手结果</strong><p>展示客户端和服务端退出码、耗时、HITLS 十六进制错误码与分端日志。</p></div>
          <div><span>04</span><strong>模式边界</strong><p>{backend.capabilities.autoMode ? "支持 Traditional、DID 与原生 Auto。" : "硬件版只开放已验证的 Traditional 与 DID；不伪造 Auto。"}</p></div>
        </div>
      </SectionCard>
    </div>
  );
}
