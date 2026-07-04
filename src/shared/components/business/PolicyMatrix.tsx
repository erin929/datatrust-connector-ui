import { StatusTag } from "../ui/StatusTag";
import type { DataField, FieldPolicy } from "../../types/domain";

const actionTone = {
  plain: "success",
  mask: "warning",
  encrypt: "info",
  deny: "danger",
} as const;

type PolicyMatrixProps = {
  fields: DataField[];
  policies: FieldPolicy[];
};

export function PolicyMatrix({ fields, policies }: PolicyMatrixProps) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>字段</th>
            <th>类型</th>
            <th>敏感等级</th>
            <th>策略动作</th>
            <th>原因</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => {
            const policy = policies.find((item) => item.field === field.field);
            return (
              <tr key={field.field}>
                <td>{field.field}</td>
                <td>{field.type}</td>
                <td>{field.level}</td>
                <td>{policy ? <StatusTag tone={actionTone[policy.action]}>{policy.action}</StatusTag> : "-"}</td>
                <td>{policy?.reason ?? field.description}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
