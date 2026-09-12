// Plan section
import type { ReactNode } from "react";

export function PlanSection({
  label,
  pill,
  price,
  highlight = false,
  children,
}: {
  label: string;
  pill?: ReactNode;
  price?: string;
  highlight?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`overflow-hidden rounded border bg-av-card ${highlight ? "border-av-amber/40" : "border-av-border"}`}>
      <div className={`flex items-center justify-between px-4 py-3 ${highlight ? "bg-av-amber/5" : ""}`}>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-av-muted">{label}</span>
          {pill}
        </div>
        {price ? <span className="text-[15px] font-semibold text-av-text">{price}</span> : null}
      </div>
      <div className="border-t border-av-border">{children}</div>
    </div>
  );
}
