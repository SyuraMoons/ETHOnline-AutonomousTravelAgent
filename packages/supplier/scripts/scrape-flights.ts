// Builds data/cache/flights.json, which packages/supplier reads at request time
// (src/lib/flightsCache.ts). Runs as a one-off/scheduled job — NEVER on the
// request path, so a slow or unreachable upstream can never affect a paid
// search or a live demo.
//
//   npm run flights:generate                       # default seeded generator
//   FLIGHTS_SOURCE=generated FLIGHTS_SEED=7 ...    # different dataset
//   FLIGHTS_START_DATE=2026-10-01 ...              # reproducible date window
//
// The row source is pluggable — see scripts/sources/index.ts. Whatever a source
// returns is validated against @sh/contracts' SearchResult here, so any source
// that drifts from the shared shape fails at generation time rather than
// serving malformed rows to a buyer who has already paid.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SearchResult } from "@sh/contracts";
import { z } from "zod";
import { localDepartureDate } from "../src/lib/airports.js";
import { resolveSource } from "./sources/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// scripts -> supplier -> packages -> repo root
const CACHE_DIR = path.resolve(__dirname, "../../../data/cache");
const FLIGHTS_PATH = path.join(CACHE_DIR, "flights.json");
const META_PATH = path.join(CACHE_DIR, "flights.meta.json");

const DEFAULT_SEED = 20260910;

async function main(): Promise<void> {
  const sourceId = process.env.FLIGHTS_SOURCE ?? "generated";
  const seed = Number(process.env.FLIGHTS_SEED ?? DEFAULT_SEED);
  if (!Number.isInteger(seed)) {
    throw new Error(
      `FLIGHTS_SEED must be an integer, got "${process.env.FLIGHTS_SEED}"`,
    );
  }
  // Defaults to today so a regenerated cache always covers upcoming dates; pin
  // FLIGHTS_START_DATE when you want byte-identical output across runs.
  const startDate =
    process.env.FLIGHTS_START_DATE ?? new Date().toISOString().slice(0, 10);

  const source = resolveSource(sourceId, { seed, startDate });
  console.log(`[flights] source "${source.id}" — ${source.description}`);

  const rows = await source.fetch();

  // Validate before writing. A source is untrusted input like any other.
  const parsed = z.array(SearchResult).safeParse(rows);
  if (!parsed.success) {
    console.error(
      `[flights] source "${source.id}" produced rows that do not match SearchResult:`,
    );
    for (const issue of parsed.error.issues.slice(0, 10)) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    throw new Error(
      `${parsed.error.issues.length} schema violation(s) — nothing written`,
    );
  }

  const duplicates = findDuplicateOfferIds(parsed.data);
  if (duplicates.length > 0) {
    // offerId is what a buyer books against and what feeds itineraryHash, so a
    // collision would let two different flights share an approval.
    throw new Error(
      `duplicate offerId(s), nothing written: ${duplicates.slice(0, 5).join(", ")}`,
    );
  }

  // Sorted so the committed file has a stable diff between regenerations.
  const sorted = [...parsed.data].sort(
    (a, b) =>
      a.origin.localeCompare(b.origin) ||
      a.destination.localeCompare(b.destination) ||
      a.departUtc.localeCompare(b.departUtc) ||
      a.offerId.localeCompare(b.offerId),
  );

  mkdirSync(CACHE_DIR, { recursive: true });
  // flights.json stays a plain SearchResult[] — loadCachedFlights() reads it
  // directly, so provenance goes in a sibling file rather than wrapping it.
  writeFileSync(FLIGHTS_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
  writeFileSync(
    META_PATH,
    `${JSON.stringify(
      {
        source: source.id,
        description: source.description,
        generatedAt: new Date().toISOString(),
        rowCount: sorted.length,
        startDate,
        seed: source.id === "generated" ? seed : undefined,
      },
      null,
      2,
    )}\n`,
  );

  const summary = summarize(sorted);
  console.log(
    `[flights] wrote ${sorted.length} rows to data/cache/flights.json`,
  );
  console.log(`[flights] ${summary.routes} routes, ${summary.dates} dates`);
  console.log(
    `[flights] rows per (route, date): min ${summary.min}, median ${summary.median}, max ${summary.max}`,
  );
  console.log(
    `[flights] search price at those counts: ${hbar(summary.min)} / ${hbar(summary.median)} / ${hbar(summary.max)} HBAR`,
  );
}

function findDuplicateOfferIds(rows: SearchResult[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.offerId)) dupes.add(row.offerId);
    seen.add(row.offerId);
  }
  return [...dupes];
}

// Mirrors the supplier's pricing so the generator reports what a search will
// actually cost — see SEARCH_PRICE_* in packages/supplier/.env.example.
function hbar(resultCount: number): string {
  return Math.min(Math.max(resultCount * 0.05, 0.1), 2.5).toFixed(2);
}

function summarize(rows: SearchResult[]) {
  const buckets = new Map<string, number>();
  const routes = new Set<string>();
  const dates = new Set<string>();
  for (const row of rows) {
    // Bucket by LOCAL departure date, matching how searchFlights() filters, so
    // these counts are the counts a buyer is actually priced on.
    const date = localDepartureDate(row.departUtc, row.origin);
    const key = `${row.origin}-${row.destination}-${date}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
    routes.add(`${row.origin}-${row.destination}`);
    dates.add(date);
  }
  const counts = [...buckets.values()].sort((a, b) => a - b);
  return {
    routes: routes.size,
    dates: dates.size,
    min: counts[0] ?? 0,
    median: counts[Math.floor(counts.length / 2)] ?? 0,
    max: counts[counts.length - 1] ?? 0,
  };
}

main().catch((error: unknown) => {
  console.error("[flights]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
