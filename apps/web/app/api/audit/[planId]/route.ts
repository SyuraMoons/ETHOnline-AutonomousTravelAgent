import { NextResponse } from "next/server";

// TODO Phase 1: read the AuditEvent stream for this planId from the HCS audit
// topic (HCS_AUDIT_TOPIC_ID) via the mirror node.
export async function GET(_request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  return NextResponse.json({ status: "not_implemented", planId }, { status: 501 });
}
