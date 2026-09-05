import { z } from "zod";

// Closed set — see AGENTS.md "Refusal reason codes". Every ActionRefused audit
// event and every refusal surfaced to the planner UI must use one of these.
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
