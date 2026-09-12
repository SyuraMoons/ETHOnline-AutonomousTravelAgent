import { z } from "zod";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// One booking call covers the whole trip.
//
// A human approves one itineraryHash, so one approval has to close over one
// booking. Booking each component separately would mean a single approval
// authorising three payments that can fail independently — leaving an itinerary
// the user approved in a state no status can honestly describe.
//
// The request carries identifiers and times only. Prices are resolved by the
// supplier from its own inventory and never taken from the client, for the same
// reason /api/execute re-derives the itinerary hash instead of trusting one:
// a client-supplied price is a client-supplied claim.

export const BookingLegRequest = z.object({
  offerId: z.string(),
});
export type BookingLegRequest = z.infer<typeof BookingLegRequest>;

export const BookingStayRequest = z.object({
  hotelId: z.string(),
  checkIn: z.string().regex(DATE, "checkIn must be YYYY-MM-DD"),
  checkOut: z.string().regex(DATE, "checkOut must be YYYY-MM-DD"),
});
export type BookingStayRequest = z.infer<typeof BookingStayRequest>;

export const BookingActivityRequest = z.object({
  activityId: z.string(),
  startUtc: z.string().datetime(),
});
export type BookingActivityRequest = z.infer<typeof BookingActivityRequest>;

export const BookingRequest = z.object({
  /** At least one flight leg. A trip without a flight is not a trip we sell. */
  legs: z.array(BookingLegRequest).min(1, "at least one leg is required"),
  /** Optional: "book the flight now, decide on the hotel later" is a real request. */
  stay: BookingStayRequest.optional(),
  activities: z.array(BookingActivityRequest).default([]),
  passengerName: z.string().min(1),
  passengerEmail: z.string().email(),
});
export type BookingRequest = z.infer<typeof BookingRequest>;

// POST /v1/booking is a flat x402 charge regardless of what the itinerary
// contains — the fee is for the booking action, not its contents. A confirmed
// booking is ALWAYS "CONFIRMED_SIMULATED", Ed25519-signed by the supplier's
// SUPPLIER_SIGNING_KEY — never a real reservation. Do not dress this up.
export const BookingStatus = z.enum([
  "CONFIRMED_SIMULATED",
  "failed",
  "not_implemented",
]);
export type BookingStatus = z.infer<typeof BookingStatus>;

/** What the supplier actually booked, at the prices it resolved. This is what the signature attests to. */
export const BookingConfirmation = z.object({
  legs: z.array(
    z.object({
      offerId: z.string(),
      departUtc: z.string().datetime(),
      priceMinor: z.number().int(),
      currency: z.string().length(3),
    }),
  ),
  stay: z
    .object({
      hotelId: z.string(),
      checkInUtc: z.string().datetime(),
      checkOutUtc: z.string().datetime(),
      priceMinor: z.number().int(),
      currency: z.string().length(3),
    })
    .optional(),
  activities: z.array(
    z.object({
      activityId: z.string(),
      startUtc: z.string().datetime(),
      priceMinor: z.number().int(),
      currency: z.string().length(3),
    }),
  ),
  /** Sum of every component above, in minor units of `currency`. */
  totalMinor: z.number().int(),
  currency: z.string().length(3),
});
export type BookingConfirmation = z.infer<typeof BookingConfirmation>;

export const BookingResponse = z.object({
  bookingId: z.string(),
  status: BookingStatus,
  confirmationCode: z.string().optional(),
  signature: z.string().optional(),
  issuedAt: z.string().datetime().optional(),
  /** Present on success. Absent means nothing was booked. */
  confirmed: BookingConfirmation.optional(),
});
export type BookingResponse = z.infer<typeof BookingResponse>;
