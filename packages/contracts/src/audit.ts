import { z } from "zod";

const AuditEventBase = z.object({
  eventId: z.string(),
  planId: z.string(),
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
  nullifierHash: z.string(),
});

export const BookingExecuted = AuditEventBase.extend({
  type: z.literal("BookingExecuted"),
  bookingId: z.string(),
  totalPriceHbar: z.number(),
});

export const ActionRefused = AuditEventBase.extend({
  type: z.literal("ActionRefused"),
  reason: z.string(),
  ruleViolated: z.string(),
});

export const AuditEvent = z.discriminatedUnion("type", [
  DataPayment,
  HumanApproval,
  BookingExecuted,
  ActionRefused,
]);
export type AuditEvent = z.infer<typeof AuditEvent>;
