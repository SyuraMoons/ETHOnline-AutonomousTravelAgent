import { z } from "zod";
import { createQuoteCache } from "../lib/quotes.js";
import { findFlights, type FlightQuery } from "../lib/inventory.js";
import { createPaidSearchRoute } from "./paidSearch.js";
import type { SearchResult } from "@sh/contracts";

// Reference implementation for a metered search. Priced per result row:
// clamp(count x SEARCH_PRICE_PER_RESULT_HBAR, MIN, MAX).

const QuerySchema = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  departDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "departDate must be YYYY-MM-DD"),
  paxCount: z.coerce.number().int().positive().default(1),
});

export const flightQuotes = createQuoteCache<FlightQuery, SearchResult>({
  namespace: "flights",
  resolve: findFlights,
  // Normalised so "cgk" and " CGK " are the same search, and so the 402 and the
  // paid retry land on one quote.
  identity: (query) => ({
    origin: query.origin.trim().toUpperCase(),
    destination: query.destination.trim().toUpperCase(),
    departDate: query.departDate,
    paxCount: query.paxCount,
  }),
});

export const flightsRouter = createPaidSearchRoute({
  path: "/v1/flights/search",
  schema: QuerySchema,
  params: ["origin", "destination", "departDate", "paxCount"],
  cache: flightQuotes,
  band: "flights",
  toBody: (quote) => ({
    quoteId: quote.quoteId,
    expiresAt: new Date(quote.expiresAt).toISOString(),
    resultCount: quote.results.length,
    results: quote.results,
  }),
});
