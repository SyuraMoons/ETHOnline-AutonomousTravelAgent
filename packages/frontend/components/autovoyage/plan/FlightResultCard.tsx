"use client";

// One row in the results list. Left side is the schedule, right side is the
// money and the commitment — mirrors how a metasearch result reads.
import { StatusPill } from "../ui/StatusPill";
import type { FlightOption, SearchResult } from "@sh/contracts";
import { formatUsd } from "~~/services/autovoyage/currency";
import { formatLegTime, legDuration } from "~~/services/autovoyage/flightOptions";

/** Two-letter carrier mark, standing in for an airline logo. */
function CarrierMark({ airline }: { airline: string }) {
  const initials = airline
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase();

  return (
    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-av-blue-tint font-mono text-[10px] font-semibold text-av-blue">
      {initials}
    </span>
  );
}

function LegRow({ leg, stops }: { leg: SearchResult; stops: number }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <CarrierMark airline={leg.airline} />
      <div className="w-[104px] flex-shrink-0">
        <div className="text-[14px] font-semibold text-av-text">
          {formatLegTime(leg.departUtc)} – {formatLegTime(leg.arriveUtc)}
        </div>
        <div className="font-mono text-[11px] text-av-muted">
          {leg.origin} → {leg.destination}
        </div>
      </div>
      <div className="w-[68px] flex-shrink-0 text-[13px] text-av-muted">{stops === 0 ? "direct" : `${stops} stop`}</div>
      <div className="text-[13px] text-av-muted">{legDuration(leg)}</div>
    </div>
  );
}

export function FlightResultCard({ option, onSelect }: { option: FlightOption; onSelect: (optionId: string) => void }) {
  const airline = option.legs[0]?.airline ?? "";

  return (
    <div className="flex flex-col overflow-hidden rounded border border-av-border bg-av-card sm:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
        {option.badges.length > 0 ? (
          <div className="mb-1 flex gap-1.5">
            {option.badges.map(badge => (
              <StatusPill key={badge} tone={badge === "best" ? "approved" : "neutral"}>
                {badge === "best" ? "Best" : badge === "cheapest" ? "Cheapest" : "Fastest"}
              </StatusPill>
            ))}
          </div>
        ) : null}

        {option.legs.map(leg => (
          <LegRow key={leg.offerId} leg={leg} stops={option.stops} />
        ))}

        <span className="mt-1 text-[12px] text-av-muted">{airline}</span>
      </div>

      <div className="flex flex-shrink-0 flex-col items-start justify-center gap-0.5 border-t border-av-border bg-av-bg p-4 sm:w-[190px] sm:border-t-0 sm:border-l">
        <span className="text-[20px] leading-tight font-semibold text-av-text">{formatUsd(option.perPaxMinor)}</span>
        <span className="text-[12px] text-av-muted">/ person</span>
        <span className="mt-0.5 text-[13px] font-medium text-av-text">{formatUsd(option.totalMinor)} total</span>
        <span className="text-[12px] text-av-muted">{option.cabin}</span>
        <button
          type="button"
          onClick={() => onSelect(option.optionId)}
          className="mt-3 w-full rounded bg-av-blue px-4 py-2 text-[13px] font-medium text-av-paper transition-colors hover:bg-av-blue-hover"
        >
          Select
        </button>
      </div>
    </div>
  );
}
