import { z } from "zod";

// One flight leg, as returned by GET /v1/flights/search and as fed into
// itineraryHash()'s `legs` array. priceMinor/currency is the flight fare
// (e.g. USD cents) — separate from the HBAR x402 fee paid to call this API.
export const SearchResult = z.object({
  offerId: z.string(),
  origin: z.string(),
  destination: z.string(),
  departUtc: z.string().datetime(),
  arriveUtc: z.string().datetime(),
  airline: z.string(),
  flightNumber: z.string(),
  priceMinor: z.number().int(),
  currency: z.string(),
  seatsAvailable: z.number().int(),
  // Optional so it never enters itineraryHash()'s input list (which hashes a fixed key set) —
  // true only for rows the supplier's cache actually knows about (bookable via POST
  // /v1/booking); a synthetic fallback row for an uncovered route/date omits it or sets false.
  fromInventory: z.boolean().optional(),
});
export type SearchResult = z.infer<typeof SearchResult>;

// A bookable round-trip (or one-way) built from SearchResult legs — one row in
// the flight results list. `itineraryHash` is derived server-side per option so
// the client only ever echoes back an optionId, never a hash it computed
// itself (see AGENTS.md "Itinerary hash").
export const FlightOptionBadge = z.enum(["best", "cheapest", "fastest"]);
export type FlightOptionBadge = z.infer<typeof FlightOptionBadge>;

export const FlightOption = z.object({
  optionId: z.string(),
  itineraryHash: z.string(),
  legs: z.array(SearchResult).min(1),
  perPaxMinor: z.number().int(),
  totalMinor: z.number().int(),
  currency: z.string(),
  cabin: z.string(),
  stops: z.number().int(),
  durationMinutes: z.number().int(),
  badges: z.array(FlightOptionBadge),
});
export type FlightOption = z.infer<typeof FlightOption>;
