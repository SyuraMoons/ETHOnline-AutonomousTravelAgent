// Chat flight card
import type { ChatFlightOption } from "~~/types/autovoyage/plan";
import { formatUsd } from "~~/services/autovoyage/currency";

export function ChatFlightCard({ option }: { option: ChatFlightOption }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded border border-av-border bg-av-card px-4 py-3">
      <div className="min-w-0">
        <p className="m-0 text-[14px] font-semibold text-av-text">{option.airline}</p>
        <p className="m-0 mt-0.5 text-[13px] text-av-muted">
          {option.route} · {option.meta}
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        <span className="text-[15px] font-semibold text-av-text">{formatUsd(option.priceMinor)}</span>
        <button
          type="button"
          className="rounded bg-av-blue px-3 py-1.5 text-[13px] font-medium text-av-paper transition-colors hover:bg-av-blue-hover"
        >
          Select
        </button>
      </div>
    </div>
  );
}
