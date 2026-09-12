import { z } from "zod";
import { FlightOption } from "./flights.js";
import { RefusalReason } from "./refusal.js";

// One day of the agent's own free-text suggestions — never a bookable item. `source` is a
// literal so the UI type-narrows on it rather than trusting a boolean flag that could drift.
export const ItineraryDay = z.object({
  dayNumber: z.number().int().positive(),
  date: z.string(),
  title: z.string(),
  notes: z.string(),
  suggestions: z.array(z.string()),
  source: z.literal("agent_suggestion"),
});
export type ItineraryDay = z.infer<typeof ItineraryDay>;

// The autonomous run's final report: the flight pair it chose (real, paid-for x402 data) plus
// a day plan it wrote itself (free, unpaid, not backed by any supplier). `bookable` is the
// honest signal for the checkout button — only offers the supplier's cached inventory actually
// knows about (see packages/supplier's findOfferById) will settle at POST /v1/booking; a
// synthetic fallback offer would otherwise fail at payment time instead of before it.
export const TripDossier = z.object({
  dossierId: z.string(),
  createdAt: z.string().datetime(),
  trip: z.object({
    origin: z.string(),
    destination: z.string(),
    departDate: z.string(),
    returnDate: z.string().optional(),
    paxCount: z.number().int().positive(),
    cabin: z.string(),
  }),
  option: FlightOption,
  itineraryHash: z.string(),
  days: z.array(ItineraryDay),
  fareTotalMinor: z.number().int(),
  currency: z.string(),
  bookable: z.boolean(),
  notBookableReason: z.string().optional(),
  searchSpend: z.array(z.object({ amountHbar: z.string(), transaction: z.string(), hashscanUrl: z.string() })),
  bookingFeeHbarEstimate: z.string(),
});
export type TripDossier = z.infer<typeof TripDossier>;

// POST /api/execute — spends the execution token minted at consent-verify to actually book
// every leg of a saved dossier. Never carries a client-sent itineraryHash: the route re-derives
// it from the stored dossier's legs and rejects a mismatch as itinerary_mismatch.
export const ExecuteRequest = z.object({
  dossierId: z.string(),
  executionToken: z.string(),
  mandateId: z.string(),
  passenger: z.object({ name: z.string(), email: z.string().email() }),
});
export type ExecuteRequest = z.infer<typeof ExecuteRequest>;

export const ExecutedBooking = z.object({
  offerId: z.string(),
  bookingId: z.string(),
  confirmationCode: z.string().optional(),
  amountHbar: z.string(),
  transaction: z.string(),
  hashscanUrl: z.string(),
});
export type ExecutedBooking = z.infer<typeof ExecutedBooking>;

// "partial" exists because the supplier has no cancel endpoint and every booking is
// CONFIRMED_SIMULATED — there is no rollback to pretend at if leg 2 fails after leg 1 settles,
// so a partial result is reported honestly rather than hidden behind an all-or-nothing status.
export const ExecuteResponse = z.object({
  status: z.enum(["booked", "partial", "refused"]),
  bookings: z.array(ExecutedBooking),
  totalHbarPaid: z.string(),
  refusal: z
    .object({ reason: RefusalReason, detail: z.string().optional(), message: z.string() })
    .optional(),
  failed: z.object({ offerId: z.string(), reason: z.string() }).optional(),
});
export type ExecuteResponse = z.infer<typeof ExecuteResponse>;
