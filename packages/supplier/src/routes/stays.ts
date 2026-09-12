import {
  STAY_SEARCH_PARAMS,
  StaySearchQuery,
  stayQuotes,
} from "../lib/staySearch.js";
import { createPaidSearchRoute } from "./paidSearch.js";

// Metered per property offered: clamp(count x STAY_PRICE_PER_RESULT_HBAR, MIN, MAX).
// A stay search returns one row per property, already priced for the requested
// nights, so the count a buyer pays for is the count of real choices they get.

export const staysRouter = createPaidSearchRoute({
  path: "/v1/stays/search",
  schema: StaySearchQuery,
  params: STAY_SEARCH_PARAMS,
  cache: stayQuotes,
  band: "stays",
  toBody: (quote) => ({
    quoteId: quote.quoteId,
    expiresAt: new Date(quote.expiresAt).toISOString(),
    resultCount: quote.results.length,
    results: quote.results,
  }),
});
