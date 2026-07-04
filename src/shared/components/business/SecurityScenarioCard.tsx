import type { SecurityScenario } from "../../types/domain";
import { StatusTag } from "../ui/StatusTag";

export function SecurityScenarioCard({ scenario }: { scenario: SecurityScenario }) {
  const tone = scenario.severity === "high" ? "danger" : scenario.severity === "medium" ? "warning" : "info";

  return (
    <div className="scenario-card">
      <div className="scenario-card__head">
        <h3>{scenario.name}</h3>
        <StatusTag tone={tone}>{scenario.severity}</StatusTag>
      </div>
      <p><strong>风险输入：</strong>{scenario.inputRisk}</p>
      <p><strong>拦截位置：</strong>{scenario.interceptionPoint}</p>
      <p><strong>处置结果：</strong>{scenario.result}</p>
      <div className="terminal-log">
        {scenario.logs.map((log, index) => <div key={`${scenario.id}-${index}`}>[{index + 1}] {log}</div>)}
      </div>
    </div>
  );
}
