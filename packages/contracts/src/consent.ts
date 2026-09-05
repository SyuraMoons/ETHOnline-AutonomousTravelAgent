import { z } from "zod";

export const ConsentInitiateResponse = z.object({
  sessionId: z.string(),
  worldAppId: z.string(),
  worldActionId: z.string(),
  itineraryHash: z.string(),
});
export type ConsentInitiateResponse = z.infer<typeof ConsentInitiateResponse>;

export const ConsentVerifyRequest = z.object({
  sessionId: z.string(),
  itineraryHash: z.string(),
  proof: z.string(),
  merkleRoot: z.string(),
  nullifierHash: z.string(),
  verificationLevel: z.enum(["orb", "device"]),
});
export type ConsentVerifyRequest = z.infer<typeof ConsentVerifyRequest>;

export const ConsentVerifyResponse = z.object({
  verified: z.boolean(),
  executionToken: z.string().optional(),
  reason: z.string().optional(),
});
export type ConsentVerifyResponse = z.infer<typeof ConsentVerifyResponse>;
