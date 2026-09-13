"use client";

// Kayak-style date picker: a field that opens a calendar popover instead of a raw
// native date input. Click a day to set departure, click again to set the return
// (return trips); one-way closes after the first pick. Values stay ISO "YYYY-MM-DD"
// so the rest of the search flow is untouched.
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarIcon, ChevronDownIcon } from "../ui/icons";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Parse an ISO date as a *local* calendar day (never UTC — avoids off-by-one). */
function parseISO(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function toISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function fmt(s: string): string {
  const d = parseISO(s);
  if (!d) return "Add date";
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DateRangeField({
  tripType,
  departDate,
  returnDate,
  onDepartChange,
  onReturnChange,
  fieldLabel = "Dates",
}: {
  tripType: "return" | "oneway";
  departDate: string;
  returnDate: string;
  onDepartChange: (v: string) => void;
  onReturnChange: (v: string) => void;
  fieldLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  const depart = parseISO(departDate);
  const ret = parseISO(returnDate);
  const [view, setView] = useState<Date>(() => startOfMonth(depart ?? today));

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Dates are seeded a tick after mount, so snap the calendar to the current
  // departure month each time it opens rather than to whatever month was set first.
  useEffect(() => {
    if (open) setView(startOfMonth(parseISO(departDate) ?? today));
  }, [open, departDate, today]);

  function pick(day: Date) {
    if (tripType === "oneway") {
      onDepartChange(toISO(day));
      setOpen(false);
      return;
    }
    // Return trip: first click starts a fresh range, second click closes it.
    const haveOpenRange = depart && !ret;
    if (haveOpenRange && depart && day.getTime() >= depart.getTime()) {
      onReturnChange(toISO(day));
      setOpen(false);
    } else {
      onDepartChange(toISO(day));
      onReturnChange("");
    }
  }

  // Build the visible month grid (leading blanks + days).
  const monthStart = startOfMonth(view);
  const leading = monthStart.getDay();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));

  const atCurrentMonth = view.getFullYear() === today.getFullYear() && view.getMonth() === today.getMonth();

  function inRange(d: Date): boolean {
    if (!depart || !ret) return false;
    return d.getTime() > depart.getTime() && d.getTime() < ret.getTime();
  }

  const summary =
    tripType === "return" ? `${fmt(departDate)} – ${ret ? fmt(returnDate) : "Return"}` : fmt(departDate);

  return (
    <div ref={wrapRef} className="relative flex flex-col gap-0.5 border-b border-av-border px-4 py-2.5 md:border-b-0 md:border-r">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-av-muted">{fieldLabel}</span>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-left"
      >
        <CalendarIcon size={15} className="flex-shrink-0 text-av-muted" />
        <span className="whitespace-nowrap text-[14px] font-medium text-av-text">{summary}</span>
        <ChevronDownIcon size={14} className="flex-shrink-0 text-av-muted" />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-[300px] max-w-[86vw] rounded border border-av-border bg-av-paper p-3">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setView(v => addMonths(v, -1))}
              disabled={atCurrentMonth}
              aria-label="Previous month"
              className="rotate-90 rounded px-2 py-1 text-av-muted transition-colors hover:text-av-text disabled:opacity-30"
            >
              <ChevronDownIcon size={16} />
            </button>
            <span className="text-[13px] font-semibold text-av-text">
              {MONTHS[view.getMonth()]} {view.getFullYear()}
            </span>
            <button
              type="button"
              onClick={() => setView(v => addMonths(v, 1))}
              aria-label="Next month"
              className="-rotate-90 rounded px-2 py-1 text-av-muted transition-colors hover:text-av-text"
            >
              <ChevronDownIcon size={16} />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map(w => (
              <span key={w} className="py-1 text-center text-[10px] font-semibold uppercase text-av-muted">
                {w}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (!d) return <span key={`b${i}`} />;
              const past = d.getTime() < today.getTime();
              const isDepart = depart && sameDay(d, depart);
              const isReturn = ret && sameDay(d, ret);
              const isEdge = isDepart || isReturn;
              const between = inRange(d);
              return (
                <button
                  key={toISO(d)}
                  type="button"
                  disabled={past}
                  onClick={() => pick(d)}
                  className={`h-8 rounded text-[12px] font-medium transition-colors ${
                    past
                      ? "cursor-not-allowed text-av-border"
                      : isEdge
                        ? "bg-av-blue text-av-paper"
                        : between
                          ? "bg-av-blue-tint text-av-blue"
                          : "text-av-text hover:bg-av-blue-tint"
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {tripType === "return" ? (
            <p className="mt-2 text-[11px] text-av-muted">
              {depart && !ret ? "Now pick the end date." : "Pick a start date."}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
