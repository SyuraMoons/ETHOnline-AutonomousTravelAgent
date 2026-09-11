// Chat flight card
import type { FlightOption } from "@sh/contracts";
import { usePlan } from "~~/components/autovoyage/plan/PlanProvider";

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function ChatFlightCard({ option }: { option: FlightOption }) {
  const { selectOption } = usePlan();
  const first = option.legs[0];
  const stopsLabel = option.stops === 0 ? "nonstop" : `${option.stops} stop${option.stops === 1 ? "" : "s"}`;
  const total = (option.totalMinor / 100).toLocaleString("en-US", { style: "currency", currency: option.currency });

  return (
    <div className="flex items-center justify-between gap-4 rounded border border-av-border bg-av-card px-4 py-3">
      <div className="min-w-0">
        <p className="m-0 text-[14px] font-semibold text-av-text">
          {first.airline}
          {option.badges.length > 0 ? (
            <span className="ml-2 text-[11px] font-medium uppercase tracking-[0.06em] text-av-blue">
              {option.badges.join(" · ")}
            </span>
          ) : null}
        </p>
        <p className="m-0 mt-0.5 text-[13px] text-av-muted">
          {first.origin} → {first.destination} · {stopsLabel} · {formatDuration(option.durationMinutes)}
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        <span className="text-[15px] font-semibold text-av-text">{total}</span>
        <button
          type="button"
          onClick={() => selectOption(option.optionId)}
          className="rounded bg-av-blue px-3 py-1.5 text-[13px] font-medium text-av-paper transition-colors hover:bg-av-blue-hover"
        >
          Select
        </button>
      </div>
    </div>
  );
}
