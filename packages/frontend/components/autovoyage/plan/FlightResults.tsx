"use client";

// The results list, between the search bar and the plan.
//
// Two controls do real work — the Direct toggle and the sort — because they can
// be honoured against the data we have. The remaining filter chips are rendered
// disabled rather than wired to nothing: a chip that looks live and silently
// filters nothing is worse than one that admits it isn't built.
import { useMemo, useState } from "react";
import { ChevronDownIcon, CoinIcon, FilterIcon } from "../ui/icons";
import { FlightResultCard } from "./FlightResultCard";
import { usePlan } from "./PlanProvider";
import type { FlightOption } from "@sh/contracts";

type Sort = "best" | "cheapest" | "fastest";

const SORTS: { value: Sort; label: string }[] = [
  { value: "best", label: "Best" },
  { value: "cheapest", label: "Cheapest" },
  { value: "fastest", label: "Fastest" },
];

const UNBUILT_FILTERS = ["Stops", "Times", "Airlines", "Airports", "Duration"];

function sortOptions(options: FlightOption[], sort: Sort): FlightOption[] {
  if (sort === "best") return options; // the server already ranks best-first
  const by = sort === "cheapest" ? (o: FlightOption) => o.totalMinor : (o: FlightOption) => o.durationMinutes;
  return [...options].sort((a, b) => by(a) - by(b));
}

export function FlightResults() {
  const { options, payment, selectOption } = usePlan();
  const [directOnly, setDirectOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("best");

  const visible = useMemo(() => {
    const filtered = directOnly ? options.filter(o => o.stops === 0) : options;
    return sortOptions(filtered, sort);
  }, [options, directOnly, sort]);

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-6 py-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled
          title="Filter panel is not built in this demo"
          className="flex cursor-not-allowed items-center gap-1.5 rounded border border-av-border bg-av-card px-3 py-1.5 text-[13px] font-medium text-av-muted opacity-60"
        >
          <FilterIcon size={15} />
          All filters
        </button>

        <button
          type="button"
          aria-pressed={directOnly}
          onClick={() => setDirectOnly(v => !v)}
          className={`rounded border px-3 py-1.5 text-[13px] font-medium transition-colors ${
            directOnly
              ? "border-av-blue bg-av-blue-tint text-av-blue"
              : "border-av-border bg-av-card text-av-text hover:bg-av-bg"
          }`}
        >
          Direct
        </button>

        {UNBUILT_FILTERS.map(label => (
          <button
            key={label}
            type="button"
            disabled
            title="Not wired up in this demo"
            className="flex cursor-not-allowed items-center gap-1 rounded border border-av-border bg-av-card px-3 py-1.5 text-[13px] font-medium text-av-muted opacity-60"
          >
            {label}
            <ChevronDownIcon size={13} />
          </button>
        ))}

        <label className="ml-auto flex items-center gap-1.5 rounded border border-av-border bg-av-card px-3 py-1.5">
          <span className="text-[12px] text-av-muted">Sort</span>
          <span className="relative flex items-center">
            <select
              aria-label="Sort results"
              value={sort}
              onChange={e => setSort(e.target.value as Sort)}
              className="cursor-pointer appearance-none bg-transparent pr-5 text-[13px] font-medium text-av-text outline-none"
            >
              {SORTS.map(s => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <ChevronDownIcon size={13} className="pointer-events-none absolute right-0 text-av-muted" />
          </span>
        </label>
      </div>

      {payment ? (
        <div className="flex items-center gap-2.5 rounded border border-av-border bg-av-card px-4 py-3">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-av-blue-tint text-av-blue">
            <CoinIcon size={15} />
          </span>
          <p className="m-0 text-[13px] text-av-text">
            Agent paid <span className="font-mono font-semibold">{payment.amountHbar} HBAR</span> to {payment.supplier}{" "}
            for these {payment.resultCount} results
            <span className="text-av-muted"> · x402, settled on Hedera testnet</span>
            {" · "}
            <a
              href={payment.hashscanUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-av-blue underline underline-offset-2"
            >
              view outbound tx{payment.inbound ? "s" : ""} on HashScan
            </a>
            {payment.inbound ? (
              <>
                {" "}
                (
                <a
                  href={payment.inbound.hashscanUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-av-blue underline underline-offset-2"
                >
                  return tx
                </a>
                )
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded border border-av-border bg-av-card px-4 py-8 text-center text-[13px] text-av-muted">
          No direct flights on this route. Turn off the Direct filter to see connections.
        </div>
      ) : (
        visible.map(option => <FlightResultCard key={option.optionId} option={option} onSelect={selectOption} />)
      )}
    </div>
  );
}
