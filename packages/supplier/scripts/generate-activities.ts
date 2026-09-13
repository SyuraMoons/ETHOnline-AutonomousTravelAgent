// Builds data/cache/activities.json. Runs offline, never on the request path.
//
//   npm run activities:generate
//   ACTIVITIES_SEED=7 npm run activities:generate

import { Activity } from "@sh/contracts";
import { writeCache } from "./lib/writeCache.js";
import {
  ACTIVITY_CITIES,
  ACTIVITY_COUNT,
  generateActivities,
} from "./sources/activities.generated.js";

const DEFAULT_SEED = 20260910;

function main(): void {
  const seed = Number(process.env["ACTIVITIES_SEED"] ?? DEFAULT_SEED);
  if (!Number.isInteger(seed)) {
    throw new Error(
      `ACTIVITIES_SEED must be an integer, got "${process.env["ACTIVITIES_SEED"]}"`,
    );
  }

  const { rows, file } = writeCache({
    name: "activities",
    rows: generateActivities(seed),
    schema: Activity,
    idOf: (activity) => activity.activityId,
    sort: (a, b) =>
      a.city.localeCompare(b.city) ||
      a.pace.localeCompare(b.pace) ||
      a.activityId.localeCompare(b.activityId),
    meta: {
      source: "generated",
      description: `deterministic synthetic activities — ${ACTIVITY_CITIES.length} cities, seed ${seed}`,
      seed,
      cities: ACTIVITY_CITIES,
    },
  });

  console.log(
    `[activities] wrote ${rows.length} of ${ACTIVITY_COUNT} experiences to ${file}`,
  );
  for (const city of ACTIVITY_CITIES) {
    const inCity = rows.filter((row) => row.city === city);
    const byPace = (["calm", "balanced", "adventurous"] as const)
      .map(
        (pace) =>
          `${pace[0]!.toUpperCase()}:${inCity.filter((row) => row.pace === pace).length}`,
      )
      .join(" ");
    console.log(
      `[activities]   ${city}  ${String(inCity.length).padStart(2)} items  ${byPace}`,
    );
  }
}

try {
  main();
} catch (error) {
  console.error("[activities]", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
