import type { HandshakeResult } from "../../../shared/runtime-contract";
import { SectionCard } from "../../shared/components/ui/SectionCard";
import { StatusTag } from "../../shared/components/ui/StatusTag";

function statusTone(status: HandshakeResult["status"]) {
  return status === "succeeded" ? "success" as const : status === "timed_out" ? "warning" as const : "danger" as const;
}

function show(value: string | number | null) {
  return value ?? "原生端未报告";
}

export function HandshakeResultPanel({ result }: { result: HandshakeResult | null }) {
  if (!result) {
    return (
      <SectionCard title="握手结果" eyebrow="Native result" className="result-card">
        <div className="empty-state"><span>↗</span><h3>等待真实握手</h3><p>执行后将在这里展示原生进程返回的证书模式、DID 校验、HITLS 错误码和完整日志。</p></div>
      </SectionCard>
    );
  }

  return (
    <SectionCard title="握手结果" eyebrow="Native result" className="result-card">
      <div className="result-summary">
        <div><StatusTag tone={statusTone(result.status)}>{result.status}</StatusTag><h3>{result.connection.completed ? "TLS 握手已完成" : "TLS 握手未完成"}</h3><p>{result.connection.target.host}:{result.connection.target.port} · {new Date(result.startedAt).toLocaleString()}</p></div>
        <strong>{result.connection.nativeHandshakeMs ?? result.connection.durationMs}<small> ms</small></strong>
      </div>
      <div className="result-section">
        <h4>连接与进程</h4>
        <dl className="metric-list">
          <div><dt>HITLS 错误码</dt><dd>{show(result.connection.hitlsCode)}</dd></div>
          <div><dt>TLS Alert</dt><dd>{show(result.connection.tlsAlert)}</dd></div>
          <div><dt>客户端退出码</dt><dd>{show(result.process.client.exitCode)}</dd></div>
          <div><dt>服务端退出码</dt><dd>{result.process.server ? show(result.process.server.exitCode) : "外部服务端"}</dd></div>
        </dl>
      </div>
      <div className="result-section">
        <h4>DID 验证</h4>
        <div className="verification-line">
          <StatusTag tone={result.didVerification.status === "succeeded" ? "success" : result.didVerification.status === "failed" ? "danger" : "neutral"}>{result.didVerification.status}</StatusTag>
          <code>{result.didVerification.code === null ? "code: -" : `code: ${result.didVerification.code}`}</code>
          <strong>{result.didVerification.name ?? "未产生 DID_VerifyResult"}</strong>
        </div>
        <p className="verification-message">{result.didVerification.message}</p>
        <p className="verification-message">链上验证：{result.didVerification.verifyOnChain ? "已执行或已尝试" : "未执行"}</p>
      </div>
      <div className="result-section">
        <h4>证书协商</h4>
        <dl className="metric-list">
          <div><dt>本地证书模式</dt><dd>{result.negotiation.localCertificateMode}</dd></div>
          <div><dt>对端证书模式</dt><dd>{result.negotiation.peerCertificateMode}</dd></div>
          <div><dt>Client DID auth</dt><dd>{show(result.negotiation.clientDidAuthMode)}</dd></div>
          <div><dt>Server DID auth</dt><dd>{show(result.negotiation.serverDidAuthMode)}</dd></div>
        </dl>
      </div>
      <details className="native-log" open={result.status !== "succeeded"}>
        <summary>原生日志 · {result.logs.length} 行</summary>
        <div className="terminal">
          {result.logs.length ? result.logs.map((entry) => (
            <div className={`terminal-line terminal-line--${entry.level}`} key={`${entry.sequence}-${entry.source}-${entry.stream}`}><span>{entry.source}/{entry.stream === "stdout" ? "out" : "err"}</span><code>{entry.message}</code></div>
          )) : <div className="terminal-empty">原生进程没有输出日志。</div>}
        </div>
      </details>
    </SectionCard>
  );
}
