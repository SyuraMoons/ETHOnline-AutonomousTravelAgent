"use client";

// Kayak-style city/airport combobox: a text input that filters a curated list of
// destinations as you type and drops down matching suggestions. Picking one stores
// a readable "City (CODE)" label — which is also what the brief parser reads best.
// Free text you type that matches nothing is still kept, so it never blocks a search.
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinIcon, PlaneIcon } from "../ui/icons";

type Place = { code: string; city: string; country: string; airport: string };

// A curated shortlist — enough to feel real in a demo without shipping a full airport DB.
const PLACES: Place[] = [
  { code: "SIN", city: "Singapore", country: "Singapore", airport: "Changi" },
  { code: "NRT", city: "Tokyo", country: "Japan", airport: "Narita" },
  { code: "HND", city: "Tokyo", country: "Japan", airport: "Haneda" },
  { code: "KIX", city: "Osaka", country: "Japan", airport: "Kansai" },
  { code: "ICN", city: "Seoul", country: "South Korea", airport: "Incheon" },
  { code: "HKG", city: "Hong Kong", country: "Hong Kong", airport: "Hong Kong Intl" },
  { code: "TPE", city: "Taipei", country: "Taiwan", airport: "Taoyuan" },
  { code: "BKK", city: "Bangkok", country: "Thailand", airport: "Suvarnabhumi" },
  { code: "KUL", city: "Kuala Lumpur", country: "Malaysia", airport: "KLIA" },
  { code: "CGK", city: "Jakarta", country: "Indonesia", airport: "Soekarno-Hatta" },
  { code: "DPS", city: "Bali", country: "Indonesia", airport: "Ngurah Rai" },
  { code: "MNL", city: "Manila", country: "Philippines", airport: "Ninoy Aquino" },
  { code: "DEL", city: "Delhi", country: "India", airport: "Indira Gandhi" },
  { code: "BOM", city: "Mumbai", country: "India", airport: "Chhatrapati Shivaji" },
  { code: "DXB", city: "Dubai", country: "UAE", airport: "Dubai Intl" },
  { code: "DOH", city: "Doha", country: "Qatar", airport: "Hamad" },
  { code: "IST", city: "Istanbul", country: "Turkey", airport: "Istanbul" },
  { code: "LHR", city: "London", country: "United Kingdom", airport: "Heathrow" },
  { code: "CDG", city: "Paris", country: "France", airport: "Charles de Gaulle" },
  { code: "AMS", city: "Amsterdam", country: "Netherlands", airport: "Schiphol" },
  { code: "FRA", city: "Frankfurt", country: "Germany", airport: "Frankfurt" },
  { code: "MAD", city: "Madrid", country: "Spain", airport: "Barajas" },
  { code: "BCN", city: "Barcelona", country: "Spain", airport: "El Prat" },
  { code: "FCO", city: "Rome", country: "Italy", airport: "Fiumicino" },
  { code: "ZRH", city: "Zurich", country: "Switzerland", airport: "Zurich" },
  { code: "JFK", city: "New York", country: "United States", airport: "John F. Kennedy" },
  { code: "LAX", city: "Los Angeles", country: "United States", airport: "Los Angeles Intl" },
  { code: "SFO", city: "San Francisco", country: "United States", airport: "San Francisco Intl" },
  { code: "ORD", city: "Chicago", country: "United States", airport: "O'Hare" },
  { code: "YYZ", city: "Toronto", country: "Canada", airport: "Pearson" },
  { code: "GRU", city: "Sao Paulo", country: "Brazil", airport: "Guarulhos" },
  { code: "SYD", city: "Sydney", country: "Australia", airport: "Kingsford Smith" },
  { code: "MEL", city: "Melbourne", country: "Australia", airport: "Tullamarine" },
  { code: "AKL", city: "Auckland", country: "New Zealand", airport: "Auckland" },
  { code: "JNB", city: "Johannesburg", country: "South Africa", airport: "O. R. Tambo" },
  { code: "CAI", city: "Cairo", country: "Egypt", airport: "Cairo Intl" },
];

const label = (p: Place) => `${p.city} (${p.code})`;

function match(list: Place[], raw: string): Place[] {
  const q = raw.trim().toLowerCase();
  if (q === "") return list.slice(0, 8);
  return list
    .filter(
      p =>
        p.city.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q) ||
        p.airport.toLowerCase().includes(q),
    )
    .slice(0, 8);
}

export function CityField({
  fieldLabel,
  value,
  onChange,
  placeholder = "City",
  className = "",
}: {
  fieldLabel: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => match(PLACES, value), [value]);

  // Close when the focus/click leaves this field.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function choose(p: Place) {
    onChange(label(p));
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive(a => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(a => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && results[active]) {
        e.preventDefault();
        choose(results[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} className={`relative flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-2.5 ${className}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-av-muted">{fieldLabel}</span>
      <input
        value={value}
        onChange={e => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        className="w-full min-w-0 bg-transparent text-[15px] font-medium text-av-text outline-none placeholder:font-normal placeholder:text-av-muted"
      />

      {open && results.length > 0 ? (
        <ul className="absolute left-0 top-full z-30 mt-1 max-h-[280px] w-[300px] max-w-[86vw] overflow-auto rounded border border-av-border bg-av-paper py-1">
          {results.map((p, i) => (
            <li key={p.code}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(p)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                  i === active ? "bg-av-blue-tint" : "hover:bg-av-blue-tint"
                }`}
              >
                <PlaneIcon size={15} className="flex-shrink-0 text-av-muted" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-medium text-av-text">
                    {p.city} <span className="text-av-muted">({p.code})</span>
                  </span>
                  <span className="truncate text-[11px] text-av-muted">
                    {p.airport}, {p.country}
                  </span>
                </span>
                <MapPinIcon size={13} className="flex-shrink-0 text-av-muted" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
