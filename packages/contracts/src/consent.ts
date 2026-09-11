import { z } from "zod";
import { RefusalReason } from "./refusal.js";

// --- Booking confirmation session ---------------------------------------------
// Binds a plain confirm click to one exact itinerary: the session records the
// itineraryHash it was opened with, and verify rejects a mismatch. This is what
// keeps the execution token non-replayable for a different booking — no proof
// of humanity is involved, the mandate's on-chain allowance already covers that.

export const ConsentInitiateRequest = z.object({
  itineraryHash: z.string(),
  // Correlates this session's eventual HumanApproval audit event with the same planId as the
  // DataPayment/BookingExecuted events for the same trip. Optional: omit and the approval is
  // simply not audit-logged (best-effort, same posture as every other HCS write in this build).
  planId: z.string().optional(),
});
export type ConsentInitiateRequest = z.infer<typeof ConsentInitiateRequest>;

export const ConsentInitiateResponse = z.object({
  sessionId: z.string(),
  itineraryHash: z.string(),
});
export type ConsentInitiateResponse = z.infer<typeof ConsentInitiateResponse>;

export const ConsentVerifyRequest = z.object({
  sessionId: z.string(),
  itineraryHash: z.string(),
  mandateId: z.string().optional(),
  planId: z.string().optional(),
});
export type ConsentVerifyRequest = z.infer<typeof ConsentVerifyRequest>;

export const ConsentVerifyResponse = z.object({
  verified: z.boolean(),
  executionToken: z.string().optional(),
  reason: RefusalReason.optional(),
});
export type ConsentVerifyResponse = z.infer<typeof ConsentVerifyResponse>;
