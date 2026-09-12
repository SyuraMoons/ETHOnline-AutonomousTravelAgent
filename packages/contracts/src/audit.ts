import { z } from "zod";
import { RefusalReason } from "./refusal.js";

// One JSON message per event on the HCS audit topic, {type, v, ...}, kept
// under 1KB and readable on HashScan without a decoder. Separate topic from
// the HCS service registry.
const AuditEventBase = z.object({
  eventId: z.string(),
  planId: z.string(),
  v: z.literal(1),
  timestamp: z.string().datetime(),
});

export const DataPayment = AuditEventBase.extend({
  type: z.literal("DataPayment"),
  amountHbar: z.number(),
  payTo: z.string(),
  txId: z.string(),
});

export const HumanApproval = AuditEventBase.extend({
  type: z.literal("HumanApproval"),
  itineraryHash: z.string(),
  payerAccountId: z.string(),
});

export const BookingExecuted = AuditEventBase.extend({
  type: z.literal("BookingExecuted"),
  bookingId: z.string(),
  fareTotalMinor: z.number().int(),
  currency: z.string(),
});

// The closed RefusalReason set plus the two operational failures AGENTS.md deliberately keeps
// out of it ("Refusal reason codes") — supplier_unreachable / payment_rejected describe things
// going wrong, not a mandate/consent decision, but they still belong on the trust trail (a
// revoked allowance rejecting a payment is exactly what should show up here).
export const AuditRefusalReason = z.union([RefusalReason, z.enum(["supplier_unreachable", "payment_rejected"])]);
export type AuditRefusalReason = z.infer<typeof AuditRefusalReason>;

export const ActionRefused = AuditEventBase.extend({
  type: z.literal("ActionRefused"),
  reason: AuditRefusalReason,
});

export const AuditEvent = z.discriminatedUnion("type", [
  DataPayment,
  HumanApproval,
  BookingExecuted,
  ActionRefused,
]);
export type AuditEvent = z.infer<typeof AuditEvent>;
