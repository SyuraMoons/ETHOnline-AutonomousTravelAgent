import { NextResponse } from "next/server";

// TODO Phase 1: query the HCS registry topic (HCS_REGISTRY_TOPIC_ID) via the
// Mirror Node REST API (not an SDK subscription) at boot, with an env fallback
// if the topic read fails.
export async function GET() {
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}
