"use client";

// Audit list
import { useState } from "react";
import type { AuditCategory, AuditTrail } from "~~/types/autovoyage/plan";

const TABS: { key: "all" | AuditCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "payment", label: "Payments" },
  { key: "approval", label: "Approvals" },
];

export function AuditList({ trail }: { trail: AuditTrail }) {
  const [tab, setTab] = useState<"all" | AuditCategory>("all");
  const rows = tab === "all" ? trail.rows : trail.rows.filter(r => r.category === tab);

  return (
    <>
      <div className="flex w-fit rounded border border-av-border p-0.5">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded px-4 py-1.5 text-[13px] font-medium transition-colors ${
              tab === t.key ? "bg-av-blue-tint text-av-blue" : "text-av-muted hover:text-av-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-av-muted">{trail.group}</p>
        <div className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-4 rounded border border-av-border bg-av-card px-4 py-3"
            >
              <div className="min-w-0">
                <p className="m-0 text-[14px] font-semibold text-av-text">{row.title}</p>
                <p className="m-0 mt-0.5 truncate font-mono text-[11px] text-av-muted">{row.ref}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-4">
                {row.amount ? <span className="font-mono text-[13px] font-medium text-av-text">{row.amount}</span> : null}
                <span className="w-14 text-right font-mono text-[11px] text-av-muted">{row.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
