import { NextResponse } from "next/server";

// TODO Phase 1: re-derive itineraryHash server-side from @sh/contracts —
// NEVER trust a client-sent hash. Validate the execution token + remaining
// mandate ceiling, reject a mismatch as ActionRefused · itinerary_mismatch,
// otherwise call packages/supplier POST /v1/booking and write BookingExecuted
// to the HCS audit topic.
export async function POST() {
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}
