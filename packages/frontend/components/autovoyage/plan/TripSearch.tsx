"use client";

// Kayak-style tabbed trip search for the /plan empty state.
//
// Three tabs — Flights, Hotels, Activities. Flights runs the structured flight
// search (SearchBar -> submitSearch, which pays the x402 supplier). Hotels and
// Activities compose a plain-English brief and hand it to the agent (sendBrief),
// which plans them within the limits you set — no separate paid data source.
import { type ComponentType, type FormEvent, useEffect, useState } from "react";
import { BedIcon, ChevronDownIcon, MapPinIcon, PlaneIcon, SearchIcon, UsersIcon } from "../ui/icons";
import { CityField } from "./CityField";
import { DateRangeField } from "./DateRangeField";
import { usePlan } from "./PlanProvider";
import { SearchBar } from "./SearchBar";

type Tab = "flights" | "hotels" | "activities";
type IconType = ComponentType<{ size?: number; className?: string }>;

const TABS: { key: Tab; label: string; Icon: IconType }[] = [
  { key: "flights", label: "Flights", Icon: PlaneIcon },
  { key: "hotels", label: "Hotels", Icon: BedIcon },
  { key: "activities", label: "Activities", Icon: MapPinIcon },
];

function isoDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

const fieldLabel = "text-[10px] font-semibold uppercase tracking-[0.08em] text-av-muted";
const segment = "flex flex-col gap-0.5 border-b border-av-border px-4 py-2.5 md:border-b-0 md:border-r";

/** Hotels / Activities: destination + dates + count, handed to the agent as a brief. */
function AgentSearch({ kind }: { kind: "hotels" | "activities" }) {
  const { sendBrief, pending } = usePlan();
  const [destination, setDestination] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [count, setCount] = useState(2);

  useEffect(() => {
    setStart(prev => prev || isoDate(30));
    setEnd(prev => prev || isoDate(33));
  }, []);

  const noun = kind === "hotels" ? "guest" : "traveller";
  const ready = destination.trim() !== "" && start !== "";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ready || pending) return;
    const range = end ? `${start} to ${end}` : `around ${start}`;
    const who = `${count} ${noun}${count === 1 ? "" : "s"}`;
    const brief =
      kind === "hotels"
        ? `Find a hotel in ${destination} for ${range}, for ${who}.`
        : `Suggest activities in ${destination} for ${range}, for ${who}.`;
    void sendBrief(brief);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex w-full flex-col rounded border border-av-border bg-av-card md:flex-row md:items-stretch">
        <CityField
          fieldLabel="Destination"
          value={destination}
          onChange={setDestination}
          placeholder="City or region"
          className="border-b border-av-border md:border-b-0 md:border-r"
        />

        <DateRangeField
          tripType="return"
          fieldLabel={kind === "hotels" ? "Check-in / out" : "Dates"}
          departDate={start}
          returnDate={end}
          onDepartChange={setStart}
          onReturnChange={setEnd}
        />

        <div className={segment}>
          <span className={fieldLabel}>Who</span>
          <div className="flex items-center gap-2">
            <UsersIcon size={15} className="flex-shrink-0 text-av-muted" />
            <span className="relative inline-flex items-center">
              <select
                aria-label={noun}
                value={count}
                onChange={e => setCount(Number(e.target.value))}
                className="w-[104px] cursor-pointer appearance-none bg-transparent pr-5 text-[13px] font-medium text-av-text outline-none"
              >
                {Array.from({ length: 9 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1} {noun}
                    {i === 0 ? "" : "s"}
                  </option>
                ))}
              </select>
              <ChevronDownIcon size={14} className="pointer-events-none absolute right-0 text-av-muted" />
            </span>
          </div>
        </div>

        <button
          type="submit"
          disabled={!ready || pending}
          aria-label={`Search ${kind}`}
          className="flex flex-shrink-0 items-center justify-center gap-2 bg-av-blue px-6 py-3 text-[14px] font-medium text-av-paper transition-colors hover:bg-av-blue-hover disabled:opacity-40"
        >
          <SearchIcon size={17} />
          <span>{pending ? "Searching..." : "Search"}</span>
        </button>
      </div>
      <p className="m-0 text-[12px] text-av-muted">The agent plans {kind} within the limits you set.</p>
    </form>
  );
}

export function TripSearch() {
  const [tab, setTab] = useState<Tab>("flights");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b border-av-border">
        {TABS.map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-[14px] font-medium transition-colors ${
                active ? "border-av-blue text-av-blue" : "border-transparent text-av-muted hover:text-av-text"
              }`}
            >
              <Icon size={17} />
              {label}
            </button>
          );
        })}
      </div>

      {tab === "flights" ? <SearchBar variant="hero" /> : <AgentSearch kind={tab} />}
    </div>
  );
}

