import { NextResponse } from "next/server";

// TODO Phase 1: recompute itineraryHash, validate the execution token +
// remaining mandate ceiling, then call apps/supplier POST /v1/booking.
export async function POST() {
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}
