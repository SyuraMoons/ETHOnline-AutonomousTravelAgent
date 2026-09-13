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

/**
 * How the fare is paid.
 *
 * HBAR buys DATA. It does not buy the ticket. An airline seat or a hotel room
 * settles against a payment instrument the traveller already holds, and an
 * agent cannot mint one — so the fare is charged to a card and the x402 rail is
 * reserved for what it is actually good at: metered, autonomous purchases of
 * information.
 *
 * This is a SIMULATED instrument and is built so it cannot quietly become a
 * real one. `token` must match a test-token shape, and `assertNoPan()` refuses
 * anything card-number-shaped anywhere in the object. Wiring this to a real
 * processor would mean deleting those guards on purpose, not flipping an env
 * var by accident.
 */
export const PaymentInstrument = z.object({
  method: z.literal("card"),
  /** Test token only — never a card number. See assertNoPan(). */
  token: z
    .string()
    .regex(
      /^tok_test_[A-Za-z0-9]{8,}$/,
      "token must be a test token (tok_test_…), never a card number",
    ),
  brand: z.enum(["visa", "mastercard", "amex"]),
  /** Display only. Four digits, so it can never carry a full number. */
  last4: z.string().regex(/^\d{4}$/, "last4 must be exactly four digits"),
  holderName: z.string().min(1),
});
export type PaymentInstrument = z.infer<typeof PaymentInstrument>;

/**
 * Refuses anything that looks like a real card number, anywhere in the payload.
 *
 * The schema already constrains each field, but a PAN pasted into holderName
 * would otherwise sail through and end up in a signed confirmation and in logs.
 * Checks length and the Luhn checksum, which together are what distinguishes a
 * card number from an ordinary run of digits.
 */
export function assertNoPan(value: unknown): void {
  for (const run of JSON.stringify(value ?? "").match(/\d[\d ,-]{11,24}\d/g) ??
    []) {
    const digits = run.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19 || !luhnValid(digits))
      continue;
    throw new Error(
      "refusing a value that looks like a real card number — this service only accepts simulated test tokens",
    );
  }
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export const BookingRequest = z.object({
  /** At least one flight leg. A trip without a flight is not a trip we sell. */
  legs: z.array(BookingLegRequest).min(1, "at least one leg is required"),
  /** Optional: "book the flight now, decide on the hotel later" is a real request. */
  stay: BookingStayRequest.optional(),
  activities: z.array(BookingActivityRequest).default([]),
  passengerName: z.string().min(1),
  passengerEmail: z.string().email(),
  /** The fare settles here. Required: an itinerary nobody pays for is not a booking. */
  payment: PaymentInstrument,
});
export type BookingRequest = z.infer<typeof BookingRequest>;

// POST /v1/booking carries no HBAR charge. Searching costs HBAR because data is
// what this supplier sells; the fare is charged to the traveller's card, which
// is a different amount going to a different party.
//
// A confirmed booking is ALWAYS "CONFIRMED_SIMULATED", Ed25519-signed by the
// supplier's SUPPLIER_SIGNING_KEY — never a real reservation, and the card
// authorisation is simulated too. Do not dress either up.
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
  /** What was charged to the card for that total. Simulated, always. */
  fareCharged: z.object({
    amountMinor: z.number().int(),
    currency: z.string().length(3),
    brand: z.enum(["visa", "mastercard", "amex"]),
    last4: z.string().regex(/^\d{4}$/),
    /** Simulated authorisation reference. Not a real acquirer code. */
    authCode: z.string(),
    simulated: z.literal(true),
  }),
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
