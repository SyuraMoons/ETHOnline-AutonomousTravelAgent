import { z } from "zod";

export const MandateStatus = z.enum(["active", "exhausted", "expired", "revoked"]);
export type MandateStatus = z.infer<typeof MandateStatus>;

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
