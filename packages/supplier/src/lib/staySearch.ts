import { z } from "zod";
import type { StayOffer } from "@sh/contracts";
import { createQuoteCache } from "./quotes.js";
import { searchStays, type StayQuery } from "./staysCache.js";

/**
 * The stay search as domain logic: what a valid query looks like, and which
 * quote one resolves to.
 *
 * Kept out of routes/ so it can be imported without config.ts, which hard-
 * requires PAY_TO. The route module owns transport; this owns meaning.
 */

export const StaySearchQuery = z.object({
  city: z.string().length(3, "city must be a 3-letter IATA code"),
  checkIn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "checkIn must be YYYY-MM-DD"),
  checkOut: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "checkOut must be YYYY-MM-DD"),
  guests: z.coerce.number().int().positive().optional(),
  minStars: z.coerce.number().int().min(1).max(5).optional(),
  maxTotalMinor: z.coerce.number().int().positive().optional(),
});

export const STAY_SEARCH_PARAMS = [
  "city",
  "checkIn",
  "checkOut",
  "guests",
  "minStars",
  "maxTotalMinor",
] as const;

export const stayQuotes = createQuoteCache<StayQuery, StayOffer>({
  namespace: "stays",
  resolve: searchStays,
  // Every field here changes the result set, so every one has to be in the key:
  // omitting maxTotalMinor would serve a budget search from an unfiltered quote.
  identity: (query) => ({
    city: query.city.trim().toUpperCase(),
    checkIn: query.checkIn,
    checkOut: query.checkOut,
    guests: query.guests ?? null,
    minStars: query.minStars ?? null,
    maxTotalMinor: query.maxTotalMinor ?? null,
  }),
});
