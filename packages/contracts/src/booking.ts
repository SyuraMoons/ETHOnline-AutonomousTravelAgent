import { z } from "zod";

export const BookingRequest = z.object({
  offerId: z.string(),
  passengerName: z.string(),
  passengerEmail: z.string().email(),
});
export type BookingRequest = z.infer<typeof BookingRequest>;

// POST /v1/booking is a flat 1.00 HBAR x402 charge. A confirmed booking is
// ALWAYS "CONFIRMED_SIMULATED", Ed25519-signed by the supplier's
// SUPPLIER_SIGNING_KEY — never a real reservation. Do not dress this up.
export const BookingStatus = z.enum(["CONFIRMED_SIMULATED", "failed", "not_implemented"]);
export type BookingStatus = z.infer<typeof BookingStatus>;

export const BookingResponse = z.object({
  bookingId: z.string(),
  status: BookingStatus,
  confirmationCode: z.string().optional(),
  signature: z.string().optional(),
});
export type BookingResponse = z.infer<typeof BookingResponse>;
