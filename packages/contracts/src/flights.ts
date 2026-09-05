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
});
export type SearchResult = z.infer<typeof SearchResult>;
