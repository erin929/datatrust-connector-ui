import type { ReactNode } from "react";

type SectionCardProps = {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  className?: string;
};

export function SectionCard({ title, eyebrow, children, className = "" }: SectionCardProps) {
  return (
    <section className={`section-card ${className}`}>
      {eyebrow ? <div className="section-eyebrow">{eyebrow}</div> : null}
      <h2>{title}</h2>
      {children}
    </section>
  );
}
