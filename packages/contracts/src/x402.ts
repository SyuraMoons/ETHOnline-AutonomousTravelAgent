import { z } from "zod";

export const AgentCardService = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  endpoint: z.string(),
  method: z.enum(["GET", "POST"]),
  network: z.string(),
});
export type AgentCardService = z.infer<typeof AgentCardService>;

export const AgentCard = z.object({
  agentId: z.string(),
  name: z.string(),
  description: z.string(),
  payTo: z.string(),
  services: z.array(AgentCardService),
});
export type AgentCard = z.infer<typeof AgentCard>;

// Mirrors the x402 402-response `accepts[]` shape used by @x402/core /
// @x402/hedera's ExactHederaScheme. Amounts are tinybars (1 HBAR = 1e8),
// asset "0.0.0" denotes native HBAR, network is CAIP-2 (e.g. "hedera:testnet").
export const X402PaymentOption = z.object({
  scheme: z.literal("exact"),
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
