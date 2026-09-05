import { Router } from "express";

export const bookingRouter = Router();

// Flat BOOKING_FEE_HBAR (1.00 HBAR) x402 charge. On success, returns a
// BookingResponse with status "CONFIRMED_SIMULATED", Ed25519-signed with
// SUPPLIER_SIGNING_KEY — never a real reservation.
//
// TODO Phase 1: wire the same x402 verify/settle flow as flights.ts, then
// sign and return the BookingResponse from @sh/contracts.
bookingRouter.post("/v1/booking", (_req, res) => {
  res.status(501).json({ status: "not_implemented" });
});
