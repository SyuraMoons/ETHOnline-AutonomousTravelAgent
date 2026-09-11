import { z } from "zod";

// Closed set — see AGENTS.md "Refusal reason codes". Every refusal surfaced to the planner
// UI must use one of these. ActionRefused audit events use the wider AuditRefusalReason
// (see audit.ts), which also covers the two operational failures below.
export const RefusalReason = z.enum([
  "per_tx_ceiling_exceeded",
  "total_ceiling_exceeded",
  "mandate_expired",
  "consent_missing",
  "consent_expired",
  "itinerary_mismatch",
  "quote_expired",
]);
export type RefusalReason = z.infer<typeof RefusalReason>;
