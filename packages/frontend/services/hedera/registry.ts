import { fetchTopicMessages } from "./mirrorNode";
import { type AgentCard, RegistryEvent, canonicalJson } from "@sh/contracts";
import { verify } from "node:crypto";
import "server-only";

type IdentityClaim = Extract<RegistryEvent, { type: "AgentIdentityClaimed" }>;

export type RegistryEntry = {
  agentId: string;
  card: AgentCard;
  identity: { publicKeyBase64: string; verified: boolean; claimedAt: string } | null;
};

function verifySignedClaim(claim: IdentityClaim): boolean {
  try {
    const message = Buffer.from(
      canonicalJson({
        agentId: claim.agentId,
        publicKeyBase64: claim.publicKeyBase64,
        v: claim.v,
        timestamp: claim.timestamp,
      }),
      "utf8",
    );
    const publicKey = Buffer.from(claim.publicKeyBase64, "base64");
    const signature = Buffer.from(claim.signature, "base64");
    return verify(null, message, { key: publicKey, format: "der", type: "spki" }, signature);
  } catch {
    return false;
  }
}

/**
 * Reads the HCS agent registry straight from Mirror Node — no local cache, no synthetic data.
 * Two message types are folded per agentId: the latest AgentRegistered gives the discoverable
 * AgentCard, the latest AgentIdentityClaimed gives a self-attested Ed25519 identity (an
 * HCS-14-style claim) that is independently re-verified here, never trusted at face value.
 *
 * Shared by GET /api/registry and services/autovoyage/supplierClient.ts's discovery fallback —
 * both need the same fold-and-verify logic, and calling it in-process avoids a self-HTTP hop.
 */
export async function readRegistry(): Promise<{ topicId: string | null; entries: RegistryEntry[] }> {
  const topicId = process.env.HCS_REGISTRY_TOPIC_ID;
  if (!topicId) return { topicId: null, entries: [] };

  const messages = await fetchTopicMessages(topicId, { order: "asc", limit: 100 });

  const byAgent = new Map<string, { card?: AgentCard; identity?: RegistryEntry["identity"] }>();

  for (const m of messages) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(m.message, "base64").toString("utf8"));
    } catch {
      continue;
    }
    const result = RegistryEvent.safeParse(parsed);
    if (!result.success) continue;
    const event = result.data;
    const entry = byAgent.get(event.agentId) ?? {};

    if (event.type === "AgentRegistered") {
      entry.card = event.card;
    } else {
      entry.identity = {
        publicKeyBase64: event.publicKeyBase64,
        verified: verifySignedClaim(event),
        claimedAt: event.timestamp,
      };
    }
    byAgent.set(event.agentId, entry);
  }

  const entries: RegistryEntry[] = [];
  for (const [agentId, entry] of byAgent) {
    if (!entry.card) continue; // no card yet published for this agentId — not discoverable
    entries.push({ agentId, card: entry.card, identity: entry.identity ?? null });
  }

  return { topicId, entries };
}
