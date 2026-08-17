import type { HandshakeResult } from "../../../shared/runtime-contract";
import { SectionCard } from "../../shared/components/ui/SectionCard";
import { StatusTag } from "../../shared/components/ui/StatusTag";

function tone(status: HandshakeResult["status"]) {
  return status === "succeeded" ? "success" as const : status === "timed_out" ? "warning" as const : "danger" as const;
}

export function HandshakeHistory({ items, onSelect }: { items: HandshakeResult[]; onSelect: (item: HandshakeResult) => void }) {
  return (
    <SectionCard title="认证执行历史" eyebrow="In-memory gateway history" className="history-card">
      {items.length === 0 ? (
        <div className="empty-state compact-empty"><h3>暂无执行记录</h3><p>历史只记录当前 Gateway 进程中实际执行过的握手。</p></div>
      ) : (
        <div className="history-list">
          {items.map((item) => (
            <button type="button" key={item.id} onClick={() => onSelect(item)}>
              <div><StatusTag tone={tone(item.status)}>{item.status}</StatusTag><strong>{item.request.authMode.toUpperCase()}</strong></div>
              <span>{item.connection.target.host}:{item.connection.target.port}</span>
              <span>{item.connection.nativeHandshakeMs ?? item.connection.durationMs} ms</span>
              <code>{item.connection.hitlsCode ?? item.didVerification.name ?? "no error"}</code>
              <time>{new Date(item.startedAt).toLocaleString()}</time>
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
