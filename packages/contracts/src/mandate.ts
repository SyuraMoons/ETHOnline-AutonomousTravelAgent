import { z } from "zod";

export const MandateStatus = z.enum(["active", "exhausted", "expired", "revoked"]);
export type MandateStatus = z.infer<typeof MandateStatus>;

// total/per-tx/expiry ceilings for one World ID-scoped spending mandate.
// checkMandate() (Phase 1, planner) is the only code path where a bug loses
// money live — this schema is its input/output contract.
export const Mandate = z.object({
  mandateId: z.string(),
  totalCeilingHbar: z.number(),
  perTxCeilingHbar: z.number(),
  spentHbar: z.number(),
  remainingHbar: z.number(),
  expiresAt: z.string().datetime(),
  nullifierHash: z.string(),
  status: MandateStatus,
});
export type Mandate = z.infer<typeof Mandate>;
