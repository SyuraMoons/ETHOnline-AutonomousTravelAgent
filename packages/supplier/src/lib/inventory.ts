import type { SearchResult } from "@sh/contracts";
import { loadCachedFlights } from "./flightsCache.js";
import { localDepartureDate } from "./airports.js";
import { loadCachedStays } from "./staysCache.js";
import { loadCachedActivities } from "./activitiesCache.js";

export type FlightQuery = {
  origin: string;
  destination: string;
  departDate: string; // ISO date, e.g. "2026-10-12"
  paxCount: number;
};

const MAX_RESULTS = 50;

const CARRIERS = [
  { airline: "Scoot", code: "TR" },
  { airline: "Garuda Indonesia", code: "GA" },
  { airline: "ANA", code: "NH" },
  { airline: "Singapore Airlines", code: "SQ" },
  { airline: "AirAsia", code: "QZ" },
  { airline: "Japan Airlines", code: "JL" },
] as const;

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

// Same normalisation as packages/frontend/services/autovoyage/flightOptions.ts
// — kept in sync deliberately (both need "Tokyo" and "NRT" to resolve to the
// same code so a demo query matches supplier inventory).
export function toAirportCode(place: string): string {
  const trimmed = place.trim();
  const parenthesised = trimmed.match(/\(([A-Z]{3})\)/);
  if (parenthesised) return parenthesised[1];
  if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase();

  const key = trimmed.toLowerCase().replace(/\s+/g, " ");
  if (AIRPORT_CODES[key]) return AIRPORT_CODES[key];

  const word = trimmed.split(/[\s,]+/)[0] ?? trimmed;
  return word.slice(0, 3).toUpperCase().padEnd(3, "X");
}

// FNV-1a -> mulberry32. Deterministic per (origin, destination, date) so the
// 402 price and the paid payload always agree, and re-running a demo query
// produces identical rows.
function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function departureAt(date: string, hour: number, minute: number): string {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return new Date(`${date}T${hh}:${mm}:00.000Z`).toISOString();
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function generateFlights(query: FlightQuery): SearchResult[] {
  const origin = toAirportCode(query.origin);
  const destination = toAirportCode(query.destination);
  const rand = seededRandom(`${origin}-${destination}-${query.departDate}`);

  const baseMinutes = 95 + Math.floor(rand() * 320);
  const baseFare = 12000 + Math.floor(rand() * 60) * 1000;

  return CARRIERS.map((carrier, index) => {
    const stops = index % 3 === 2 ? 1 : 0;
    const durationMinutes =
      baseMinutes +
      stops * (95 + Math.floor(rand() * 60)) +
      Math.floor(rand() * 25);
    const hour = 6 + index * 2 + Math.floor(rand() * 2);
    const minute = [0, 5, 25, 30, 45, 55][Math.floor(rand() * 6)];
    const priceMinor =
      Math.round(
        (baseFare * (0.86 + index * 0.06 + rand() * 0.05) -
          stops * baseFare * 0.11) /
          100,
      ) * 100;

    const departUtc = departureAt(query.departDate, hour, minute);
    const result: SearchResult = {
      offerId: `${carrier.code}-${origin}${destination}-${query.departDate}-${index}`,
      origin,
      destination,
      departUtc,
      arriveUtc: addMinutes(departUtc, durationMinutes),
      airline: carrier.airline,
      flightNumber: `${carrier.code}${100 + index * 7}`,
      priceMinor,
      currency: "USD",
      seatsAvailable: 4 + Math.floor(rand() * 6),
      fromInventory: false,
    };
    return result;
  });
}

/** Cached rows for the route/date if present, else deterministic fallback rows. */
export function findFlights(query: FlightQuery): SearchResult[] {
  const origin = toAirportCode(query.origin);
  const destination = toAirportCode(query.destination);
  const departDay = query.departDate.slice(0, 10);

  // Filter on the departure date LOCAL TO THE ORIGIN, not the UTC date. A 06:45
  // departure from Singapore is 22:45 UTC the day before, so a UTC-date filter
  // silently drops every early-morning flight from the day the buyer asked for —
  // and the generator buckets by local date too, so the two would disagree about
  // what a date even contains.
  const cached = loadCachedFlights().filter(
    (f) =>
      f.origin === origin &&
      f.destination === destination &&
      localDepartureDate(f.departUtc, f.origin) === departDay,
  );
  if (cached.length > 0) {
    return cached
      .slice(0, MAX_RESULTS)
      .map((f) => ({ ...f, fromInventory: true }));
  }

  return generateFlights({ ...query, origin, destination }).slice(
    0,
    MAX_RESULTS,
  );
}

/**
 * Rows the supplier can serve right now, across every domain.
 *
 * Counted flights only until now, so /health reported 1608 while the startup
 * line said 1608 flights + 158 stays + 184 activities — the same service
 * describing itself two different ways.
 */
export function cachedInventoryCount(): number {
  return (
    loadCachedFlights().length +
    loadCachedStays().length +
    loadCachedActivities().length
  );
}

/**
 * Resolve a booking request's offerId against the cached inventory. Only
 * cached rows are bookable — generated fallback rows exist to make search
 * results look plausible for routes with no cached data, but their offerIds
 * are not persisted anywhere a booking request could look them up again.
 */
export function findOfferById(offerId: string): SearchResult | undefined {
  return loadCachedFlights().find((f) => f.offerId === offerId);
}
