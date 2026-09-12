import { z } from "zod";
import { PaymentInstrument } from "./booking.js";
import { FlightOption } from "./flights.js";
import { PlanActivity, PlanStay } from "./plan.js";
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

/**
 * The stay as the dossier holds it: the hashed fields, plus the LOCAL calendar
 * dates the booking call needs.
 *
 * Both are stored because neither derives from the other safely. itineraryHash()
 * takes instants, since two check-ins on the same local date are not the same
 * booking. But POST /v1/booking takes `YYYY-MM-DD` in the property's own
 * timezone, and slicing a date off the UTC instant is wrong wherever 15:00 local
 * falls on the next UTC day — the same class of bug that already made the paid
 * flight route filter dates in the wrong timezone.
 *
 * itineraryHash() reads a fixed key set, so the two extra fields here do not
 * enter the hash.
 */
export const DossierStay = PlanStay.extend({
  checkIn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "checkIn must be YYYY-MM-DD"),
  checkOut: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "checkOut must be YYYY-MM-DD"),
});
export type DossierStay = z.infer<typeof DossierStay>;

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
  /**
   * The stay and activities the agent bought, when it bought any. Separate from
   * `days` above, which is free text the agent wrote itself: everything here was
   * paid for, came back from the supplier's catalogue, and is bookable by id.
   *
   * Both feed itineraryHash(), so an approval covers the whole trip and not just
   * its flights — swapping the hotel after a human approved invalidates the hash.
   * A flight-only trip carries `stay: undefined` and `activities: []`, which hash
   * as `null` and `[]` rather than being omitted.
   */
  stay: DossierStay.optional(),
  activities: z.array(PlanActivity).default([]),
  itineraryHash: z.string(),
  days: z.array(ItineraryDay),
  fareTotalMinor: z.number().int(),
  currency: z.string(),
  bookable: z.boolean(),
  notBookableReason: z.string().optional(),
  searchSpend: z.array(
    z.object({
      amountHbar: z.string(),
      transaction: z.string(),
      hashscanUrl: z.string(),
    }),
  ),
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
  /**
   * How the fare settles. Optional only because this is a simulation: when a
   * caller sends nothing, the planner uses a built-in test card so a demo does
   * not need one wired up. A real deployment would make this required and take
   * it from the traveller's stored instrument.
   */
  payment: PaymentInstrument.optional(),
});
export type ExecuteRequest = z.infer<typeof ExecuteRequest>;

export const ExecutedBooking = z.object({
  offerId: z.string(),
  bookingId: z.string(),
  confirmationCode: z.string().optional(),
  /** What the card was charged for the whole itinerary, in minor units. */
  fareChargedMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  cardLast4: z.string().regex(/^\d{4}$/),
  /**
   * On-chain fields, now optional: booking settles against a card, not HBAR,
   * so a booking has no transaction to point at. The HBAR an agent spent on
   * this trip was spent on SEARCHES, and those are audited separately.
   * Kept so UI that renders a HashScan link keeps compiling.
   */
  amountHbar: z.string().optional(),
  transaction: z.string().optional(),
  hashscanUrl: z.string().optional(),
});
export type ExecutedBooking = z.infer<typeof ExecutedBooking>;

// "partial" is no longer reachable. It existed when /api/execute booked one leg at a time and
// leg 2 could fail after leg 1 had settled, with no cancel endpoint to roll back to — a partial
// result reported honestly rather than hidden behind an all-or-nothing status. Booking is now a
// single call over the whole itinerary: the supplier resolves and validates every component
// before confirming anything, so a run either books the lot or books nothing.
//
// The value is kept in the enum so existing UI that switches on three states keeps compiling.
// Remove it once nothing branches on it.
export const ExecuteResponse = z.object({
  status: z.enum(["booked", "partial", "refused"]),
  bookings: z.array(ExecutedBooking),
  totalHbarPaid: z.string(),
  refusal: z
    .object({
      reason: RefusalReason,
      detail: z.string().optional(),
      message: z.string(),
    })
    .optional(),
  failed: z.object({ offerId: z.string(), reason: z.string() }).optional(),
});
export type ExecuteResponse = z.infer<typeof ExecuteResponse>;
