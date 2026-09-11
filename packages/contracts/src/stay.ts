import { z } from "zod";

// Accommodation. Two shapes on purpose:
//
//   Stay      — the catalogue record, one per property. This is what lives in
//               data/cache/hotels.json.
//   StayOffer — a priced stay for specific dates, computed at search time.
//
// Nightly rates move with the calendar (weekends, seasons), so storing a row
// per property per date would multiply the cache for no gain. The catalogue
// stays small and the search prices it.

export const Stay = z.object({
  hotelId: z.string(),
  /** IATA code of the city, matching flight destinations (SIN, DPS, NRT...). */
  city: z.string().length(3),
  name: z.string(),
  area: z.string(),
  starRating: z.number().int().min(1).max(5),
  roomType: z.string(),
  /** Base rate before date adjustment, in minor units of `currency`. */
  baseNightlyPriceMinor: z.number().int().positive(),
  currency: z.string().length(3),
  refundable: z.boolean(),
  maxGuests: z.number().int().positive(),
  amenities: z.array(z.string()),
});
export type Stay = z.infer<typeof Stay>;

// One priced stay. The first five fields are exactly what itineraryHash will
// consume once the hash covers the whole itinerary — keep them stable, and
// treat everything after `currency` as presentational.
export const StayOffer = z.object({
  hotelId: z.string(),
  checkInUtc: z.string().datetime(),
  checkOutUtc: z.string().datetime(),
  /** Total for the whole stay, not per night. */
  priceMinor: z.number().int().positive(),
  currency: z.string().length(3),

  // Presentational below this line.
  name: z.string(),
  city: z.string().length(3),
  area: z.string(),
  starRating: z.number().int().min(1).max(5),
  roomType: z.string(),
  nights: z.number().int().positive(),
  nightlyPriceMinor: z.number().int().positive(),
  refundable: z.boolean(),
  amenities: z.array(z.string()),
});
export type StayOffer = z.infer<typeof StayOffer>;
