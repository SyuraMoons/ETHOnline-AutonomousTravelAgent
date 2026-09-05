import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SearchResult } from "@sh/contracts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Repo root: src/lib -> src -> supplier -> packages -> repo root.
const FLIGHTS_CACHE_PATH = path.resolve(__dirname, "../../../../data/cache/flights.json");

// Reads the scraper's last output. Never scrape live here — this is what keeps
// /v1/flights/search fast and demo-safe regardless of the source site.
// TODO Phase 1: once x402 payment is verified, serve matching rows from this
// cache (filtered by origin/destination/date) instead of always returning 402.
export function loadCachedFlights(): SearchResult[] {
  const raw = readFileSync(FLIGHTS_CACHE_PATH, "utf-8");
  return JSON.parse(raw) as SearchResult[];
}
