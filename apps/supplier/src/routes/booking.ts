import { Router } from "express";

export const bookingRouter = Router();

// TODO Phase 1: validate BookingRequest, verify payment/mandate, write a
// BookingExecuted audit event to HCS, return a real BookingResponse.
bookingRouter.post("/v1/booking", (_req, res) => {
  res.status(501).json({ status: "not_implemented" });
});
