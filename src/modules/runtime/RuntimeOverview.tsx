import type { RuntimeInfo } from "../../../shared/runtime-contract";
import { SectionCard } from "../../shared/components/ui/SectionCard";
import { StatusTag } from "../../shared/components/ui/StatusTag";

function backendTone(status: RuntimeInfo["backend"]["status"]) {
  if (status === "ready") return "success" as const;
  if (status === "unavailable") return "danger" as const;
  return "warning" as const;
}

export function RuntimeOverview({ runtime }: { runtime: RuntimeInfo }) {
  const { backend, gateway } = runtime;

  return (
    <div className="content-grid runtime-overview">
      <SectionCard title="Connector Gateway" eyebrow="HTTP control plane">
        <div className="health-heading">
          <div className="health-icon health-icon--ready">G</div>
          <div><StatusTag tone="success">在线</StatusTag><h3>本地 API 网关</h3></div>
        </div>
        <dl className="fact-list">
          <div><dt>版本</dt><dd>{gateway.version}</dd></div>
          <div><dt>启动时间</dt><dd>{new Date(gateway.startedAt).toLocaleString()}</dd></div>
          <div><dt>运行时长</dt><dd>{gateway.uptimeSeconds} 秒</dd></div>
        </dl>
      </SectionCard>

      <SectionCard title="openHiTLS 原生后端" eyebrow="Native data plane">
        <div className="health-heading">
          <div className={`health-icon health-icon--${backend.status}`}>H</div>
          <div><StatusTag tone={backendTone(backend.status)}>{backend.status}</StatusTag><h3>{backend.executableName ?? "未配置可执行文件"}</h3></div>
        </div>
        {backend.reason ? <div className="callout callout--warning">{backend.reason}</div> : null}
        <dl className="fact-list">
          <div><dt>固定目标</dt><dd>{backend.target.host}:{backend.target.port}</dd></div>
          <div><dt>适配器</dt><dd>{backend.adapter}</dd></div>
          <div><dt>DID 证书配置</dt><dd>{backend.certificateProfiles.did.configured ? "已就绪" : "未就绪"}</dd></div>
        </dl>
      </SectionCard>

      <SectionCard title="已对齐的真实能力" eyebrow="Capability contract" className="wide-card">
        <div className="capability-grid">
          <div><span>01</span><strong>Indy DID</strong><p>从证书 SAN 解析 did:indy，并由原生 Indy VDR 查询验证。</p></div>
          <div><span>02</span><strong>证书双轨</strong><p>NORMAL / DID 证书管理器由 openHiTLS 选择；单向认证时本地证书模式显示 UNKNOWN。</p></div>
          <div><span>03</span><strong>握手结果</strong><p>真实进程退出码、耗时、HITLS 十六进制错误码及原生日志。</p></div>
          <div><span>04</span><strong>DID 错误码</strong><p>DID_VerifyResult 0–7 映射为稳定结构，不再使用演示错误。</p></div>
        </div>
      </SectionCard>
    </div>
  );
}
