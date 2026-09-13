import { NextResponse } from "next/server";
import { readRegistry } from "~~/services/hedera/registry";

export const runtime = "nodejs";

// Reads the HCS agent registry (see services/hedera/registry.ts) straight from Mirror Node on
// every request — no local cache, no synthetic data.
export async function GET() {
  try {
    const { topicId, entries } = await readRegistry();
    return NextResponse.json({ topicId, entries });
  } catch (err) {
    console.error("[api/registry]", err);
    return NextResponse.json({ error: "Mirror node request failed" }, { status: 502 });
  }
}
