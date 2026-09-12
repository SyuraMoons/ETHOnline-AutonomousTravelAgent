import { NextResponse } from "next/server";
import { RegistryEntry, type RegistryResponse } from "@sh/contracts";
import { fetchTopicMessages } from "~~/services/hedera/mirrorNode";

export const runtime = "nodejs";

/**
 * Supplier discovery: reads the HCS registry topic through Mirror Node REST.
 *
 * REST rather than an SDK subscription because this runs per request in a
 * serverless handler — a long-lived subscription has nowhere to live here, and
 * consensus order is already in the REST response.
 *
 * Falls back to SUPPLIER_BASE_URL when the topic is unset or unreadable, and
 * SAYS SO in `source`. A demo that claims on-chain discovery while quietly
 * reading an env var is not doing what it claims, and the difference should be
 * visible to whoever is looking.
 */
function envFallback(warning?: string): RegistryResponse {
  const origin = process.env.SUPPLIER_BASE_URL ?? "http://localhost:4100";
  return {
    source: "env",
    suppliers: [
      {
        type: "ServiceRegistered",
        v: 1,
        agentId: "meridian-flight-data",
        name: "Meridian Flight Data",
        origin,
        registeredAt: new Date(0).toISOString(),
      },
    ],
    ...(warning ? { warning } : {}),
  };
}

export async function GET() {
  const topicId = process.env.HCS_REGISTRY_TOPIC_ID;
  if (!topicId) {
    return NextResponse.json(envFallback("HCS_REGISTRY_TOPIC_ID is not set"));
  }

  let messages;
  try {
    messages = await fetchTopicMessages(topicId, { order: "asc", limit: 100 });
  } catch (error) {
    // A topic we cannot read is not an empty topic. Falling back is better than
    // failing the whole planner, but it must not look like a successful read.
    return NextResponse.json(envFallback(`registry topic ${topicId} unreadable: ${String(error)}`));
  }

  // Consensus order is ascending, so a later registration replaces an earlier
  // one for the same agent — a supplier that moves origin is followed.
  const bySupplier = new Map<string, RegistryEntry>();
  let skipped = 0;
  for (const message of messages) {
    let parsed;
    try {
      parsed = RegistryEntry.safeParse(JSON.parse(Buffer.from(message.message, "base64").toString("utf-8")));
    } catch {
      skipped += 1;
      continue;
    }
    // Anything that is not a registration — audit events, older schema versions,
    // someone else's traffic on a shared topic — is skipped, not an error.
    if (!parsed.success) {
      skipped += 1;
      continue;
    }
    bySupplier.set(parsed.data.agentId, parsed.data);
  }

  const suppliers = [...bySupplier.values()];
  if (suppliers.length === 0) {
    return NextResponse.json(
      envFallback(`registry topic ${topicId} holds no supplier registrations (${skipped} unrelated messages)`),
    );
  }

  const response: RegistryResponse = { source: "hcs", topicId, suppliers };
  return NextResponse.json(response);
}
