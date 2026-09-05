import { z } from "zod";

export const SearchResult = z.object({
  id: z.string(),
  origin: z.string(),
  destination: z.string(),
  departAt: z.string().datetime(),
  arriveAt: z.string().datetime(),
  airline: z.string(),
  flightNumber: z.string(),
  priceHbar: z.number(),
  currency: z.literal("HBAR"),
  seatsAvailable: z.number(),
});
export type SearchResult = z.infer<typeof SearchResult>;
