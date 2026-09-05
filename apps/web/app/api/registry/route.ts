import { NextResponse } from "next/server";

// TODO Phase 1: query the HCS registry topic (HCS_REGISTRY_TOPIC_ID) via the
// mirror node for ServiceRegistered agent cards.
export async function GET() {
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}
