// Shows what the generated caches actually contain, and what an agent would be
// charged to search them.
//
//   npm run data:inspect
//   npm run data:inspect -- --city DPS
//   npm run data:inspect -- --city NRT --date 2026-11-13 --pace calm
//
// Read-only. Useful both as a sanity check after regenerating and as the
// quickest way to see the x402 meter move without running the supplier.

import { parseArgs } from "node:util";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { searchActivities } from "../src/lib/activitiesCache.js";
import { searchStays } from "../src/lib/staysCache.js";
import { searchFlights } from "../src/lib/flightsCache.js";
import { CACHE_DIR } from "./lib/writeCache.js";
import type { ActivityPace } from "@sh/contracts";

// Mirrors the supplier's pricing. See SEARCH_PRICE_* in packages/supplier/.env.example.
const PRICING = {
  flights: { perRow: 0.05, min: 0.1, max: 2.5 },
  stays: { perRow: 0.04, min: 0.1, max: 2.0 },
  activities: { perRow: 0.02, min: 0.05, max: 1.0 },
} as const;

function priceFor(kind: keyof typeof PRICING, rows: number): string {
  const { perRow, min, max } = PRICING[kind];
  return Math.min(Math.max(rows * perRow, min), max).toFixed(2);
}

function meta(name: string): Record<string, unknown> | null {
  const file = path.join(CACHE_DIR, `${name}.meta.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
}

function usd(minor: number): string {
  return `$${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function main(): void {
  const { values } = parseArgs({
    options: {
      city: { type: "string" },
      date: { type: "string", default: "2026-11-13" },
      pace: { type: "string" },
      checkIn: { type: "string", default: "2026-11-12" },
      checkOut: { type: "string", default: "2026-11-15" },
    },
  });

  const date = values.date!;
  const pace = values.pace as ActivityPace | undefined;

  console.log("\n=== CACHE ===");
  for (const name of ["flights", "hotels", "activities"] as const) {
    const m = meta(name);
    if (!m) {
      console.log(
        `  ${name.padEnd(11)} MISSING — run \`npm run data:generate\``,
      );
      continue;
    }
    const generated = String(m["generatedAt"] ?? "")
      .slice(0, 16)
      .replace("T", " ");
    console.log(
      `  ${name.padEnd(11)} ${String(m["rowCount"]).padStart(5)} rows · seed ${m["seed"]} · generated ${generated}`,
    );
  }

  const cities: string[] = values.city
    ? [values.city.toUpperCase()]
    : ((meta("activities")?.["cities"] as string[]) ?? []);

  console.log(
    `\n=== WHAT AN AGENT PAYS TO SEARCH  (activities on ${date}${pace ? `, pace ${pace}` : ""}) ===`,
  );
  console.log("  city   stays  price     activities  price     total HBAR");
  for (const city of cities) {
    const stays = searchStays({
      city,
      checkIn: values.checkIn!,
      checkOut: values.checkOut!,
    });
    const acts = searchActivities({ city, date, ...(pace ? { pace } : {}) });
    const total = (
      Number(priceFor("stays", stays.length)) +
      Number(priceFor("activities", acts.length))
    ).toFixed(2);
    console.log(
      `  ${city}   ${String(stays.length).padStart(5)}  ${priceFor("stays", stays.length).padStart(5)}     ` +
        `${String(acts.length).padStart(10)}  ${priceFor("activities", acts.length).padStart(5)}     ${total.padStart(6)}`,
    );
  }

  if (!values.city) {
    console.log("\n  (pass --city DPS to see the actual rows)\n");
    return;
  }

  const city = values.city.toUpperCase();

  console.log(
    `\n=== ACTIVITIES · ${city} · ${date}${pace ? ` · ${pace}` : ""} ===`,
  );
  const acts = searchActivities({ city, date, ...(pace ? { pace } : {}) });
  if (acts.length === 0) {
    console.log("  no rows — check the city code, or regenerate");
  }
  for (const a of acts.slice(0, 12)) {
    const localTime = a.startUtc.slice(11, 16);
    console.log(
      `  ${usd(a.priceMinor).padStart(6)}  ${String(a.durationMinutes).padStart(3)}m  ${a.pace.padEnd(11)} ` +
        `${a.indoor ? "indoor " : "outdoor"}  ${localTime}Z  ${a.name}`,
    );
  }
  if (acts.length > 12) console.log(`  … and ${acts.length - 12} more slots`);

  console.log(
    `\n=== STAYS · ${city} · ${values.checkIn} → ${values.checkOut} ===`,
  );
  const stays = searchStays({
    city,
    checkIn: values.checkIn!,
    checkOut: values.checkOut!,
  });
  for (const s of stays.slice(0, 8)) {
    console.log(
      `  ${usd(s.priceMinor).padStart(7)} total  (${usd(s.nightlyPriceMinor)}/night × ${s.nights})  ` +
        `${"★".repeat(s.starRating).padEnd(5)} ${s.name.padEnd(26)} ${s.area}`,
    );
  }
  if (stays.length > 8)
    console.log(`  … and ${stays.length - 8} more properties`);

  const flights = searchFlights({ destination: city });
  if (flights.length > 0) {
    console.log(`\n=== FLIGHTS INTO ${city} (any date) ===`);
    console.log(
      `  ${flights.length} rows · a dated search costs ${priceFor("flights", flights.length)} HBAR at this count`,
    );
    for (const f of flights.slice(0, 4)) {
      console.log(
        `  ${usd(f.priceMinor).padStart(6)}  ${f.origin}→${f.destination}  ${f.departUtc.slice(0, 16).replace("T", " ")}Z  ${f.airline}`,
      );
    }
  }
  console.log();
}

try {
  main();
} catch (error) {
  console.error("[inspect]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
