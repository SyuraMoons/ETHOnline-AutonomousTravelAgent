import { NextResponse } from "next/server";

// TODO Phase 1: start a World ID Selfie Check session (WORLD_APP_ID /
// WORLD_ACTION_ID) whose *signal* is the plan's itineraryHash.
export async function POST() {
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}
