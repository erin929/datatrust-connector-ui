import type { ReactNode } from "react";

type StatusTagProps = {
  children: ReactNode;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
};

export function StatusTag({ children, tone = "neutral" }: StatusTagProps) {
  return <span className={`status-tag status-tag--${tone}`}>{children}</span>;
}
