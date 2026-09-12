// Formatting/normalisation helpers shared by the real x402 supplier flow
// (see services/autovoyage/supplierClient.ts, buildOptions.ts) and the plan
// result components. The fake flight generator that used to live here has
// been replaced by real paid calls to packages/supplier.
import type { SearchResult } from "@sh/contracts";

export type OptionsTrip = {
  origin: string;
  destination: string;
  departDate: string; // ISO date, e.g. "2026-10-06"
  returnDate?: string;
  paxCount: number;
  cabin?: string;
};

// The model returns free text ("Jakarta", "Tokyo", sometimes already "CGK").
// SearchResult.origin/destination feed the itinerary hash, so they need to be
// stable — normalise to an IATA code rather than passing prose through. Must
// stay in sync with packages/supplier's own inventory codes.
const AIRPORT_CODES: Record<string, string> = {
  jakarta: "CGK",
  yogyakarta: "YIA",
  bali: "DPS",
  denpasar: "DPS",
  surabaya: "SUB",
  singapore: "SIN",
  tokyo: "NRT",
  osaka: "KIX",
  seoul: "ICN",
  bangkok: "BKK",
  "kuala lumpur": "KUL",
  "hong kong": "HKG",
  taipei: "TPE",
  manila: "MNL",
  hanoi: "HAN",
  "ho chi minh city": "SGN",
  sydney: "SYD",
  melbourne: "MEL",
  dubai: "DXB",
  london: "LHR",
  paris: "CDG",
  "new york": "JFK",
  "san francisco": "SFO",
  amsterdam: "AMS",
};

export function toAirportCode(place: string): string {
  const trimmed = place.trim();
  // Already a code, or written as "Tokyo (NRT)".
  const parenthesised = trimmed.match(/\(([A-Z]{3})\)/);
  if (parenthesised) return parenthesised[1];
  if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase();

  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (AIRPORT_CODES[key]) return AIRPORT_CODES[key];

  // Fall back to the first three letters of the first word, so an unknown city
  // still renders something route-shaped instead of an empty column.
  const word = trimmed.split(/[\s,]+/)[0] ?? trimmed;
  return word.slice(0, 3).toUpperCase().padEnd(3, "X");
}

function legDurationMinutes(leg: SearchResult): number {
  return Math.round((new Date(leg.arriveUtc).getTime() - new Date(leg.departUtc).getTime()) / 60_000);
}

/** Minutes in the air for one leg, as rendered on a result row ("2h 25m"). */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "10:30" from an ISO instant, read in UTC so it matches the generated schedule. */
export function formatLegTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function legDuration(leg: SearchResult): string {
  return formatDuration(legDurationMinutes(leg));
}
