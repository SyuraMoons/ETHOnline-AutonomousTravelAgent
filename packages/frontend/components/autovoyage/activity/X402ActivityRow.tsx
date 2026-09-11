// x402 activity row
import type { ActivityRow } from "~~/types/autovoyage/plan";

export function X402ActivityRow({ row }: { row: ActivityRow }) {
  return (
    <div className="flex items-center gap-3 rounded border border-av-border bg-av-card px-4 py-3">
      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-av-blue-tint">
        <span className="h-2 w-2 rounded-full bg-av-blue" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[14px] font-semibold text-av-text">{row.title}</p>
        <p className="m-0 mt-0.5 truncate font-mono text-[11px] text-av-muted">{row.ref}</p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className={`m-0 font-mono text-[13px] font-medium ${row.pending ? "text-av-amber" : "text-av-text"}`}>
          {row.amount}
        </p>
        <p className="m-0 mt-0.5 font-mono text-[11px] text-av-muted">{row.time}</p>
      </div>
    </div>
  );
}
