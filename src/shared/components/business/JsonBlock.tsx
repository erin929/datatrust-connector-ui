import { formatJson } from "../../utils/format";

type JsonBlockProps = {
  title: string;
  value: unknown;
};

export function JsonBlock({ title, value }: JsonBlockProps) {
  return (
    <div className="json-block">
      <div className="json-block__title">{title}</div>
      <pre>{formatJson(value)}</pre>
    </div>
  );
}
