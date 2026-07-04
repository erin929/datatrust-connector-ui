import type { TraceStep } from "../../types/domain";

export function Timeline({ steps }: { steps: TraceStep[] }) {
  return (
    <div className="timeline">
      {steps.map((step, index) => (
        <div className={`timeline__item timeline__item--${step.status}`} key={`${step.title}-${index}`}>
          <div className="timeline__dot">{index + 1}</div>
          <div>
            <h4>{step.title}</h4>
            <p>{step.detail}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
