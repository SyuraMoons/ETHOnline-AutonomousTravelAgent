import {
  ACTIVITY_SEARCH_PARAMS,
  ActivitySearchQuery,
  activityQuotes,
} from "../lib/activitySearch.js";
import { createPaidSearchRoute } from "./paidSearch.js";

// Metered per bookable slot: clamp(count x ACTIVITY_PRICE_PER_RESULT_HBAR, MIN, MAX).
// One row per start time rather than per experience, because a slot is what the
// buyer actually picks — and so it is what they should be priced on. The rate is
// the lowest of the three bands for the same reason: one day in one city yields
// dozens of slots, where a flight search yields a handful.

export const activitiesRouter = createPaidSearchRoute({
  path: "/v1/activities/search",
  schema: ActivitySearchQuery,
  params: ACTIVITY_SEARCH_PARAMS,
  cache: activityQuotes,
  band: "activities",
  toBody: (quote) => ({
    quoteId: quote.quoteId,
    expiresAt: new Date(quote.expiresAt).toISOString(),
    resultCount: quote.results.length,
    results: quote.results,
  }),
});
