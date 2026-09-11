import { NextResponse } from "next/server";
import { AuditEvent } from "@sh/contracts";
import { fetchTopicMessages } from "~~/services/hedera/mirrorNode";

function hashscanUrl(topicId: string, consensusTimestamp: string): string {
  return `https://hashscan.io/testnet/topic/${topicId}/message/${consensusTimestamp}`;
}

// Reads the real HCS audit trail straight from Mirror Node on every request — no local cache,
// no synthetic data. The topic is a shared append-only log across every plan; events for other
// plans, and any malformed/pre-schema messages, are silently skipped rather than errored.
export async function GET(_request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;

  const topicId = process.env.HCS_AUDIT_TOPIC_ID;
  if (!topicId) {
    // Dev fallback for an unconfigured topic — an empty trail, not a 501: the endpoint is real,
    // there's just nothing to read yet.
    return NextResponse.json({ planId, topicId: null, events: [] });
  }

  let messages: Awaited<ReturnType<typeof fetchTopicMessages>>;
  try {
    messages = await fetchTopicMessages(topicId, { order: "asc", limit: 100 });
  } catch (err) {
    console.error("[api/audit]", err);
    return NextResponse.json({ error: "Mirror node request failed" }, { status: 502 });
  }

  const events = messages
    .map(m => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.from(m.message, "base64").toString("utf8"));
      } catch {
        return null;
      }
      const result = AuditEvent.safeParse(parsed);
      if (!result.success || result.data.planId !== planId) return null;
      return {
        ...result.data,
        consensusTimestamp: m.consensus_timestamp,
        hashscanUrl: hashscanUrl(topicId, m.consensus_timestamp),
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  return NextResponse.json({ planId, topicId, events });
}
