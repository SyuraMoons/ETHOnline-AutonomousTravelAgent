import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Activity, ActivityOffer, ActivityPace } from "@sh/contracts";
import { localTimeToUtc } from "./staysCache.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.resolve(
  __dirname,
  "../../../../data/cache/activities.json",
);

let cached: Activity[] | null = null;

/** Reads the generator's catalogue — see scripts/generate-activities.ts. */
export function loadCachedActivities(): Activity[] {
  if (cached) return cached;
  try {
    cached = JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as Activity[];
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Activity cache unreadable at ${CACHE_PATH} — run \`npm run activities:generate\`. (${reason})`,
    );
  }
  return cached;
}

export function clearActivitiesCache(): void {
  cached = null;
}

export interface ActivityQuery {
  city: string;
  /** YYYY-MM-DD, local to the city. */
  date: string;
  pace?: ActivityPace;
  maxPriceMinor?: number;
  indoor?: boolean;
}

/**
 * Expands the catalogue into bookable slots for one day.
 *
 * One row per start time, not per activity: the buyer is choosing a slot, and
 * the row count the search is priced on should reflect what they can actually
 * pick.
 */
export function searchActivities(query: ActivityQuery): ActivityOffer[] {
  const city = query.city.toUpperCase();

  return loadCachedActivities()
    .filter((activity) => {
      if (activity.city !== city) return false;
      if (query.pace !== undefined && activity.pace !== query.pace)
        return false;
      if (
        query.maxPriceMinor !== undefined &&
        activity.priceMinor > query.maxPriceMinor
      )
        return false;
      if (query.indoor !== undefined && activity.indoor !== query.indoor)
        return false;
      return true;
    })
    .flatMap((activity) =>
      activity.startTimes.map((startTime): ActivityOffer => ({
        activityId: `${activity.activityId}@${query.date}T${startTime}`,
        startUtc: localTimeToUtc(query.date, startTime, city),
        priceMinor: activity.priceMinor,
        currency: activity.currency,
        name: activity.name,
        summary: activity.summary,
        city: activity.city,
        category: activity.category,
        pace: activity.pace,
        durationMinutes: activity.durationMinutes,
        indoor: activity.indoor,
      })),
    )
    .sort(
      (a, b) =>
        a.startUtc.localeCompare(b.startUtc) ||
        a.activityId.localeCompare(b.activityId),
    );
}
