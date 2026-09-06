// Status pill
import type { ReactNode } from "react";

export function StatusPill({ tone, children }: { tone: "approved" | "needs" | "neutral"; children: ReactNode }) {
  const cls =
    tone === "approved"
      ? "bg-av-green/10 text-av-green"
      : tone === "needs"
        ? "bg-av-amber/10 text-av-amber"
        : "bg-av-blue-tint text-av-blue";
  return <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}
