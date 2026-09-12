import { z } from "zod";
import { ActivityPace, type ActivityOffer } from "@sh/contracts";
import { createQuoteCache } from "./quotes.js";
import { searchActivities, type ActivityQuery } from "./activitiesCache.js";

/** Activity search domain logic. See staySearch.ts for why this is not in routes/. */

export const ActivitySearchQuery = z.object({
  city: z.string().length(3, "city must be a 3-letter IATA code"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  pace: ActivityPace.optional(),
  maxPriceMinor: z.coerce.number().int().positive().optional(),
  indoor: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const ACTIVITY_SEARCH_PARAMS = [
  "city",
  "date",
  "pace",
  "maxPriceMinor",
  "indoor",
] as const;

export const activityQuotes = createQuoteCache<ActivityQuery, ActivityOffer>({
  namespace: "activities",
  resolve: searchActivities,
  identity: (query) => ({
    city: query.city.trim().toUpperCase(),
    date: query.date,
    pace: query.pace ?? null,
    maxPriceMinor: query.maxPriceMinor ?? null,
    indoor: query.indoor ?? null,
  }),
});
