import { z } from "zod";
import { AgentCard } from "./x402.js";

// One JSON message per event on the HCS registry topic, {type, v, ...} —
// a separate topic from the audit trail (see audit.ts). Two event types:
// AgentRegistered publishes an agent's card so it can be discovered without
// a hardcoded endpoint; AgentIdentityClaimed is a self-attested, verifiable
// binding of an agentId to the same Ed25519 key already published as the
// card's bookingPublicKey (an HCS-14-style identity claim — proves key
// possession, not real-world identity, and any reader can verify the
// signature independently without trusting the registry writer).
const RegistryEventBase = z.object({
  v: z.literal(1),
  timestamp: z.string().datetime(),
});

export const AgentRegistered = RegistryEventBase.extend({
  type: z.literal("AgentRegistered"),
  agentId: z.string(),
  card: AgentCard,
});
export type AgentRegistered = z.infer<typeof AgentRegistered>;

export const AgentIdentityClaimed = RegistryEventBase.extend({
  type: z.literal("AgentIdentityClaimed"),
  agentId: z.string(),
  publicKeyBase64: z.string(),
  // base64 Ed25519 signature over canonicalJson({agentId, publicKeyBase64, v, timestamp})
  signature: z.string(),
});
export type AgentIdentityClaimed = z.infer<typeof AgentIdentityClaimed>;

export const RegistryEvent = z.discriminatedUnion("type", [
  AgentRegistered,
  AgentIdentityClaimed,
]);
export type RegistryEvent = z.infer<typeof RegistryEvent>;
