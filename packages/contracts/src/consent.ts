import { z } from "zod";
import { RefusalReason } from "./refusal.js";

// --- Booking confirmation session ---------------------------------------------
// Binds a plain confirm click to one exact itinerary: the session records the
// itineraryHash it was opened with, and verify rejects a mismatch. This is what
// keeps the execution token non-replayable for a different booking — no proof
// of humanity is involved, the mandate's on-chain allowance already covers that.

export const ConsentInitiateRequest = z.object({
  itineraryHash: z.string(),
  // Pinned into the session at open time so verify can require the SAME mandate be named at
  // both ends — a session opened for one mandate must not be verifiable against another.
  mandateId: z.string(),
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
  // Required, and checked against the mandateId the session was opened with — see
  // ConsentInitiateRequest. A verify naming a different (or no) mandate than the one pinned
  // at initiate must fail; it used to be optional, which let an execution token be minted
  // with no mandate claim and then redeemed against any mandateId at /api/execute.
  mandateId: z.string(),
  planId: z.string().optional(),
});
export type ConsentVerifyRequest = z.infer<typeof ConsentVerifyRequest>;

export const ConsentVerifyResponse = z.object({
  verified: z.boolean(),
  executionToken: z.string().optional(),
  reason: RefusalReason.optional(),
});
export type ConsentVerifyResponse = z.infer<typeof ConsentVerifyResponse>;
