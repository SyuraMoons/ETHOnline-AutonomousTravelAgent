import { Router } from "express";
import { randomUUID } from "node:crypto";
import type { BookingResponse } from "@sh/contracts";
import { BookingRequest } from "@sh/contracts";
import { registerRoute, withPayment } from "../services/x402/server.js";
import { bookingFeeTinybars, HBAR_ASSET } from "../config.js";
import { findOfferById } from "../lib/inventory.js";
import { signPayload } from "../lib/signing.js";

export const bookingRouter = Router();

// Flat BOOKING_FEE_HBAR (default 1.00 HBAR) regardless of offer — the fee is
// for the booking action, not the fare itself (fares are quoted in USD minor
// units via the flight search, a separate concern from the HBAR service fee).
registerRoute("POST /v1/booking", () => ({
  asset: HBAR_ASSET,
  amount: bookingFeeTinybars().toString(),
}));

bookingRouter.post(
  "/v1/booking",
  withPayment(async (req) => {
    const parsed = BookingRequest.safeParse(req.body);
    if (!parsed.success) {
      return {
        error: parsed.error.issues.map((i) => i.message).join("; "),
        status: 400,
      };
    }

    const offer = findOfferById(parsed.data.offerId);
    if (!offer) {
      return { error: `Unknown offerId: ${parsed.data.offerId}`, status: 404 };
    }

    const bookingId = randomUUID();
    const confirmationCode = bookingId.slice(0, 8).toUpperCase();
    const issuedAt = new Date().toISOString();

    // ALWAYS "CONFIRMED_SIMULATED" — never a real reservation. See
    // packages/contracts/src/booking.ts.
    const signature = signPayload({
      bookingId,
      offerId: offer.offerId,
      confirmationCode,
      status: "CONFIRMED_SIMULATED",
      issuedAt,
    });

    const body: BookingResponse = {
      bookingId,
      status: "CONFIRMED_SIMULATED",
      confirmationCode,
      signature,
    };
    return { body };
  }),
);
