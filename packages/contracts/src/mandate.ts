import { z } from "zod";

export const MandateStatus = z.enum(["active", "exhausted", "expired", "revoked"]);
export type MandateStatus = z.infer<typeof MandateStatus>;

// total/per-tx/expiry ceilings for one spending mandate.
// checkMandate() (Phase 1, planner) is the only code path where a bug loses
// money live — this schema is its input/output contract.
export const Mandate = z.object({
  mandateId: z.string(),
  totalCeilingHbar: z.number(),
  perTxCeilingHbar: z.number(),
  spentHbar: z.number(),
  remainingHbar: z.number(),
  expiresAt: z.string().datetime(),
  status: MandateStatus,
  /**
   * The Hedera account whose HBAR this mandate spends — the user who granted the agent a
   * HIP-336 allowance. Absent means the legacy treasury mode, where the agent pays from its
   * own balance. This is what makes a mandate know *whose* money it governs.
   */
  payerAccountId: z.string().optional(),
});
export type Mandate = z.infer<typeof Mandate>;

/**
 * The exact spending terms the user sets in the budget card before granting the on-chain
 * allowance: this payer account, these ceilings, this duration. The HIP-336 allowance
 * approval that follows is the one signature that actually authorizes the agent to spend.
 */
export const MandateTerms = z.object({
  payerAccountId: z.string(),
  totalCeilingHbar: z.number().positive(),
  perTxCeilingHbar: z.number().positive(),
  ttlMinutes: z.number().positive(),
});
export type MandateTerms = z.infer<typeof MandateTerms>;
