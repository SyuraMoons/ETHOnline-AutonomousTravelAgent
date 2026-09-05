import { NextResponse } from "next/server";

// TODO Phase 1: start a World ID Selfie Check session bound to the plan's
// itineraryHash (WORLD_APP_ID / WORLD_ACTION_ID).
export async function POST() {
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}
