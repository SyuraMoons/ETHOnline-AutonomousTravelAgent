"use client";

// The Kayak-style trip search bar.
//
// Two variants, one form: "hero" is the centred empty-state widget, "compact" is
// the single-row bar that stays pinned above the results and the plan so you can
// re-search without going back. Submitting does not search directly — it hands a
// composed brief to the agent (see PlanProvider.submitSearch), which is what
// actually flips the stage.
import { type FormEvent, useEffect, useState } from "react";
import { CalendarIcon, ChevronDownIcon, SearchIcon, SwapIcon, UsersIcon } from "../ui/icons";
import { CityField } from "./CityField";
import { DateRangeField } from "./DateRangeField";
import { usePlan } from "./PlanProvider";
import type { CabinClass, SearchQuery } from "~~/types/autovoyage/plan";

const CABINS: CabinClass[] = ["Economy", "Premium", "Business"];

function isoDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

const EMPTY: SearchQuery = {
  tripType: "return",
  origin: "",
  destination: "",
  departDate: "",
  returnDate: "",
  paxCount: 2,
  cabin: "Economy",
};

/** Bare select that inherits the surrounding field styling. */
function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <span className={`relative inline-flex items-center ${className ?? ""}`}>
      <select
        aria-label={label}
        value={value}
        onChange={e => onChange(e.target.value as T)}
        className="w-full cursor-pointer appearance-none bg-transparent pr-5 text-[13px] font-medium text-av-text outline-none"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon size={14} className="pointer-events-none absolute right-0 text-av-muted" />
    </span>
  );
}

const PAX_OPTIONS = Array.from({ length: 9 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1} traveller${i === 0 ? "" : "s"}`,
}));

const CABIN_OPTIONS = CABINS.map(c => ({ value: c, label: c }));

const TRIP_TYPE_OPTIONS = [
  { value: "return" as const, label: "Return" },
  { value: "oneway" as const, label: "One-way" },
];

export function SearchBar({ variant = "hero" }: { variant?: "hero" | "compact" }) {
  const { trip, submitSearch, pending } = usePlan();
  const [q, setQ] = useState<SearchQuery>(EMPTY);

  // Dates are seeded after mount, not in the initial state: this component also
  // renders on the server, and `new Date()` there would not match the client.
  useEffect(() => {
    setQ(prev => (prev.departDate ? prev : { ...prev, departDate: isoDate(30), returnDate: isoDate(33) }));
  }, []);

  // Once the agent has resolved a trip (from a typed brief, say), the bar should
  // show what it actually searched rather than whatever was last typed here.
  useEffect(() => {
    if (!trip) return;
    setQ(prev => ({
      ...prev,
      tripType: trip.returnDate ? "return" : "oneway",
      origin: trip.origin,
      destination: trip.destination,
      departDate: trip.departDate,
      returnDate: trip.returnDate ?? prev.returnDate,
      paxCount: trip.paxCount,
      cabin: (CABINS.includes(trip.cabin as CabinClass) ? trip.cabin : prev.cabin) as CabinClass,
    }));
  }, [trip]);

  const set = <K extends keyof SearchQuery>(key: K, value: SearchQuery[K]) => setQ(prev => ({ ...prev, [key]: value }));

  function swap() {
    setQ(prev => ({ ...prev, origin: prev.destination, destination: prev.origin }));
  }

  const ready = q.origin.trim() !== "" && q.destination.trim() !== "" && q.departDate !== "";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ready || pending) return;
    void submitSearch(q);
  }

  const compact = variant === "compact";
  const fieldText = compact ? "text-[13px]" : "text-[14px]";

  const places = (
    <>
      <label className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 ${compact ? "" : "sm:py-3"}`}>
        <span className="sr-only">From</span>
        <input
          value={q.origin}
          onChange={e => set("origin", e.target.value)}
          placeholder="From"
          className={`w-full min-w-0 bg-transparent font-medium text-av-text outline-none placeholder:font-normal placeholder:text-av-muted ${fieldText}`}
        />
      </label>
      <button
        type="button"
        onClick={swap}
        aria-label="Swap origin and destination"
        title="Swap origin and destination"
        className="flex-shrink-0 px-2 text-av-muted transition-colors hover:text-av-blue"
      >
        <SwapIcon size={16} />
      </button>
      <label className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2 ${compact ? "" : "sm:py-3"}`}>
        <span className="sr-only">To</span>
        <input
          value={q.destination}
          onChange={e => set("destination", e.target.value)}
          placeholder="To"
          className={`w-full min-w-0 bg-transparent font-medium text-av-text outline-none placeholder:font-normal placeholder:text-av-muted ${fieldText}`}
        />
      </label>
    </>
  );

  const dates = (
    <div className={`flex items-center gap-1 px-3 py-2 ${compact ? "" : "sm:py-3"}`}>
      <CalendarIcon size={15} className="flex-shrink-0 text-av-muted" />
      <input
        type="date"
        aria-label="Departure date"
        value={q.departDate}
        onChange={e => set("departDate", e.target.value)}
        className={`bg-transparent font-medium text-av-text outline-none ${fieldText}`}
      />
      {q.tripType === "return" ? (
        <>
          <span className="text-av-muted">–</span>
          <input
            type="date"
            aria-label="Return date"
            min={q.departDate || undefined}
            value={q.returnDate}
            onChange={e => set("returnDate", e.target.value)}
            className={`bg-transparent font-medium text-av-text outline-none ${fieldText}`}
          />
        </>
      ) : null}
    </div>
  );

  const travellers = (
    <div className={`flex items-center gap-1.5 px-3 py-2 ${compact ? "" : "sm:py-3"}`}>
      <UsersIcon size={15} className="flex-shrink-0 text-av-muted" />
      <Select
        label="Travellers"
        value={String(q.paxCount)}
        onChange={v => set("paxCount", Number(v))}
        options={PAX_OPTIONS}
        className="w-[104px]"
      />
      <span className="text-av-border">|</span>
      <Select
        label="Cabin"
        value={q.cabin}
        onChange={v => set("cabin", v)}
        options={CABIN_OPTIONS}
        className="w-[84px]"
      />
    </div>
  );

  const submit = (
    <button
      type="submit"
      disabled={!ready || pending}
      aria-label="Search flights"
      className={`flex flex-shrink-0 items-center justify-center gap-2 rounded bg-av-blue font-medium text-av-paper transition-colors hover:bg-av-blue-hover disabled:opacity-40 ${
        compact ? "h-9 w-11" : "h-11 px-5 text-[14px]"
      }`}
    >
      <SearchIcon size={compact ? 16 : 17} />
      {compact ? null : <span>{pending ? "Searching..." : "Search"}</span>}
    </button>
  );

  return (
    <form onSubmit={handleSubmit} className={compact ? "flex flex-wrap items-center gap-2" : "flex flex-col gap-2"}>
      {compact ? (
        <>
          <div className="flex items-center rounded border border-av-border bg-av-card px-2 py-1">
            <Select
              label="Trip type"
              value={q.tripType}
              onChange={v => set("tripType", v)}
              options={TRIP_TYPE_OPTIONS}
              className="w-[84px]"
            />
          </div>
          <div className="flex min-w-[240px] flex-1 items-center divide-x divide-av-border rounded border border-av-border bg-av-card">
            {places}
          </div>
          <div className="flex items-center divide-x divide-av-border rounded border border-av-border bg-av-card">
            {dates}
            {travellers}
          </div>
          {submit}
        </>
      ) : (
        <>
          {/* Trip type as a small segmented control. */}
          <div className="flex gap-1">
            {TRIP_TYPE_OPTIONS.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => set("tripType", o.value)}
                className={`rounded px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  q.tripType === o.value ? "bg-av-blue-tint text-av-blue" : "text-av-muted hover:text-av-text"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* One connected bar with labelled fields; stacks on narrow columns. */}
          <div className="flex w-full flex-col rounded border border-av-border bg-av-card md:flex-row md:items-stretch">
            <div className="flex flex-1 items-center border-b border-av-border md:border-b-0 md:border-r">
              <CityField fieldLabel="From" value={q.origin} onChange={v => set("origin", v)} />
              <button
                type="button"
                onClick={swap}
                aria-label="Swap origin and destination"
                title="Swap origin and destination"
                className="flex-shrink-0 px-2 text-av-muted transition-colors hover:text-av-blue"
              >
                <SwapIcon size={16} />
              </button>
              <CityField fieldLabel="To" value={q.destination} onChange={v => set("destination", v)} />
            </div>

            <DateRangeField
              tripType={q.tripType}
              departDate={q.departDate}
              returnDate={q.returnDate}
              onDepartChange={v => set("departDate", v)}
              onReturnChange={v => set("returnDate", v)}
            />

            <div className="flex flex-col gap-0.5 border-b border-av-border px-4 py-2.5 md:border-b-0 md:border-r">
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-av-muted">Who</span>
              <div className="flex items-center gap-2">
                <UsersIcon size={15} className="flex-shrink-0 text-av-muted" />
                <Select
                  label="Travellers"
                  value={String(q.paxCount)}
                  onChange={v => set("paxCount", Number(v))}
                  options={PAX_OPTIONS}
                  className="w-[104px]"
                />
                <span className="text-av-border">·</span>
                <Select label="Cabin" value={q.cabin} onChange={v => set("cabin", v)} options={CABIN_OPTIONS} className="w-[84px]" />
              </div>
            </div>

            <button
              type="submit"
              disabled={!ready || pending}
              aria-label="Search flights"
              className="flex flex-shrink-0 items-center justify-center gap-2 bg-av-blue px-6 py-3 text-[14px] font-medium text-av-paper transition-colors hover:bg-av-blue-hover disabled:opacity-40"
            >
              <SearchIcon size={17} />
              <span>{pending ? "Searching..." : "Search"}</span>
            </button>
          </div>
        </>
      )}
    </form>
  );
}
