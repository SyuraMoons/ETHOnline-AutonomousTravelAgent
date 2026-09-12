import { z } from "zod";

/**
 * One supplier announcing itself on the HCS registry topic.
 *
 * Deliberately tiny: it says who a supplier is and where its agent card lives,
 * nothing more. Pricing, endpoints and payTo all live on the card, which the
 * supplier serves and can change without rewriting history on a topic that
 * cannot be edited. Putting them here would mean a stale registry silently
 * quoting the wrong price.
 *
 * Plaintext JSON under 1KB, readable on HashScan without a decoder — same rule
 * as the audit events.
 */
export const RegistryEntry = z.object({
  type: z.literal("ServiceRegistered"),
  v: z.literal(1),
  agentId: z.string(),
  name: z.string(),
  /**
   * Base origin of the supplier; its card is at `${origin}/.well-known/x402`.
   *
   * Restricted to http/https: zod's .url() accepts "localhost:4100" as a valid
   * URI (scheme "localhost:"), and a registration like that would be fetched as
   * something other than a web address.
   */
  origin: z
    .string()
    .url()
    .refine(
      (value) => /^https?:\/\//.test(value),
      "origin must be an http(s) URL",
    ),
  registeredAt: z.string().datetime(),
});
export type RegistryEntry = z.infer<typeof RegistryEntry>;

/** What GET /api/registry answers with. */
export const RegistryResponse = z.object({
  /**
   * "hcs" means the list came from consensus. "env" means the topic was unset or
   * unreadable and this is the configured fallback — worth surfacing, because a
   * demo that claims on-chain discovery while quietly reading an env var is not
   * doing what it says.
   */
  source: z.enum(["hcs", "env"]),
  topicId: z.string().optional(),
  suppliers: z.array(RegistryEntry),
  /** Present when a topic read was attempted and failed. */
  warning: z.string().optional(),
});
export type RegistryResponse = z.infer<typeof RegistryResponse>;
