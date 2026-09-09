import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SearchResult } from "@sh/contracts";
import { localDepartureDate } from "./airports.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Repo root: src/lib -> src -> supplier -> packages -> repo root.
const FLIGHTS_CACHE_PATH = path.resolve(
  __dirname,
  "../../../../data/cache/flights.json",
);

let cached: SearchResult[] | null = null;

/**
 * Reads the generator's last output — see scripts/scrape-flights.ts.
 *
 * Never fetch or scrape here. Everything the request path serves comes from a
 * file that was written offline, which is what keeps /v1/flights/search fast
 * and demo-safe regardless of what the upstream source is doing.
 *
 * Held in memory after the first read: a paid request should not pay a disk
 * read, and the file only changes when the offline job reruns.
 */
export function loadCachedFlights(): SearchResult[] {
  if (cached) return cached;
  try {
    cached = JSON.parse(
      readFileSync(FLIGHTS_CACHE_PATH, "utf-8"),
    ) as SearchResult[];
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Flight cache unreadable at ${FLIGHTS_CACHE_PATH} — run \`npm run flights:generate\`. (${reason})`,
    );
  }
  return cached;
}

/** Test seam; also lets a long-running process pick up a regenerated file. */
export function clearFlightsCache(): void {
  cached = null;
}

export interface FlightQuery {
  origin?: string;
  destination?: string;
  /** Departure date local to the origin airport, YYYY-MM-DD. */
  departDate?: string;
}

/**
 * Filters the cache for one search.
 *
 * The returned row COUNT is what the supplier prices on
 * (clamp(count * 0.05, 0.10, 2.50) HBAR), so this runs before the x402
 * challenge is built — the buyer is quoted for the rows they will actually get.
 */
export function searchFlights(query: FlightQuery = {}): SearchResult[] {
  const origin = query.origin?.toUpperCase();
  const destination = query.destination?.toUpperCase();

  return loadCachedFlights()
    .filter((row) => {
      if (origin && row.origin !== origin) return false;
      if (destination && row.destination !== destination) return false;
      if (
        query.departDate &&
        localDepartureDate(row.departUtc, row.origin) !== query.departDate
      )
        return false;
      return true;
    })
    .sort(
      (a, b) =>
        a.priceMinor - b.priceMinor || a.departUtc.localeCompare(b.departUtc),
    );
}
