import type { FabricEvent } from "../../types/domain";
import { StatusTag } from "../ui/StatusTag";

export function FabricEventStream({ events }: { events: FabricEvent[] }) {
  return (
    <div className="event-stream">
      {events.map((event) => (
        <div className="event-item" key={event.eventId}>
          <div>
            <span className="event-time">{event.timestamp}</span>
            <strong>{event.eventType}</strong>
            <p>{event.relatedId}{event.traceId ? ` / ${event.traceId}` : ""}</p>
          </div>
          <div className="event-meta">
            {event.policyVersion ? <StatusTag tone="info">policy v{event.policyVersion}</StatusTag> : null}
            <code>{event.txHash}</code>
          </div>
        </div>
      ))}
    </div>
  );
}
