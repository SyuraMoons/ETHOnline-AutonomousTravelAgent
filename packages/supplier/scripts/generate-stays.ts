// Builds data/cache/hotels.json. Runs offline, never on the request path.
//
//   npm run stays:generate
//   STAYS_SEED=7 npm run stays:generate
//
// Deterministic: the same seed always produces a byte-identical file, so
// regenerating an unchanged dataset is a no-op in git.

import { Stay } from "@sh/contracts";
import { writeCache } from "./lib/writeCache.js";
import {
  generateStays,
  STAY_CITIES,
  STAY_COUNT,
} from "./sources/stays.generated.js";

const DEFAULT_SEED = 20260910;

function main(): void {
  const seed = Number(process.env["STAYS_SEED"] ?? DEFAULT_SEED);
  if (!Number.isInteger(seed)) {
    throw new Error(
      `STAYS_SEED must be an integer, got "${process.env["STAYS_SEED"]}"`,
    );
  }

  const { rows, file } = writeCache({
    name: "hotels",
    rows: generateStays(seed),
    schema: Stay,
    idOf: (stay) => stay.hotelId,
    sort: (a, b) =>
      a.city.localeCompare(b.city) ||
      a.baseNightlyPriceMinor - b.baseNightlyPriceMinor ||
      a.hotelId.localeCompare(b.hotelId),
    meta: {
      source: "generated",
      description: `deterministic synthetic stays — ${STAY_CITIES.length} cities, seed ${seed}`,
      seed,
      cities: STAY_CITIES,
    },
  });

  console.log(
    `[stays] wrote ${rows.length} of ${STAY_COUNT} properties to ${file}`,
  );
  for (const city of STAY_CITIES) {
    const inCity = rows.filter((row) => row.city === city);
    const cheapest = Math.min(
      ...inCity.map((row) => row.baseNightlyPriceMinor),
    );
    const dearest = Math.max(...inCity.map((row) => row.baseNightlyPriceMinor));
    console.log(
      `[stays]   ${city}  ${String(inCity.length).padStart(2)} hotels  $${(cheapest / 100).toFixed(0)}–$${(dearest / 100).toFixed(0)}/night`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error("[stays]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
