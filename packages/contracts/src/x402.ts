import { z } from "zod";

export const AgentCardService = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  endpoint: z.string(),
  method: z.enum(["GET", "POST"]),
  network: z.string(),
  // Human-readable pricing model, e.g. "clamp(count x 0.05, 0.10, 2.50) HBAR"
  // or "flat 1.00 HBAR" — lets a third party predict cost without paying first.
  pricing: z.string().optional(),
});
export type AgentCardService = z.infer<typeof AgentCardService>;

export const AgentCard = z.object({
  agentId: z.string(),
  name: z.string(),
  description: z.string(),
  payTo: z.string(),
  services: z.array(AgentCardService),
  // base64-encoded Ed25519 public key (SPKI DER). Verifies BookingResponse.signature.
  bookingPublicKey: z.string().optional(),
});
export type AgentCard = z.infer<typeof AgentCard>;

// Mirrors the x402 `PaymentRequirements` shape emitted by @x402/core /
// @x402/hedera's ExactHederaScheme (see node_modules/@x402/core PaymentRequirements
// type: scheme, network, asset, amount, payTo, maxTimeoutSeconds, extra).
// Amounts are tinybars (1 HBAR = 1e8); asset "0.0.0" denotes native HBAR;
// network is CAIP-2 (e.g. "hedera:testnet"). This is the wire shape actually
// produced by x402HTTPResourceServer — do not hand-roll a v1-style
// `maxAmountRequired` challenge body.
export const X402PaymentOption = z.object({
  scheme: z.literal("exact"),
  network: z.string(),
  amount: z.string(),
  payTo: z.string(),
  asset: z.string(),
  maxTimeoutSeconds: z.number(),
  extra: z.record(z.unknown()).optional(),
});
export type X402PaymentOption = z.infer<typeof X402PaymentOption>;

export const X402Challenge = z.object({
  x402Version: z.number(),
  resource: z.object({
    url: z.string(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
  }),
  accepts: z.array(X402PaymentOption),
  error: z.string().optional(),
});
export type X402Challenge = z.infer<typeof X402Challenge>;
