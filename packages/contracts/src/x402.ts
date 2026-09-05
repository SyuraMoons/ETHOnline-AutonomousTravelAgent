import { z } from "zod";

export const AgentCardService = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  endpoint: z.string(),
  method: z.enum(["GET", "POST"]),
  priceHbar: z.number(),
  network: z.string(),
});
export type AgentCardService = z.infer<typeof AgentCardService>;

export const AgentCard = z.object({
  agentId: z.string(),
  name: z.string(),
  description: z.string(),
  services: z.array(AgentCardService),
});
export type AgentCard = z.infer<typeof AgentCard>;

export const X402PaymentOption = z.object({
  scheme: z.string(),
  network: z.string(),
  maxAmountRequired: z.string(),
  resource: z.string(),
  description: z.string(),
  mimeType: z.string(),
  payTo: z.string(),
  asset: z.string(),
  extra: z.record(z.unknown()).optional(),
});
export type X402PaymentOption = z.infer<typeof X402PaymentOption>;

export const X402Challenge = z.object({
  x402Version: z.number(),
  accepts: z.array(X402PaymentOption),
});
export type X402Challenge = z.infer<typeof X402Challenge>;
