import { NextResponse } from "next/server";

// TODO Phase 1: verify the World ID proof (WORLD_API_KEY), confirm its signal
// matches the plan's itineraryHash exactly, then mint a short-lived execution
// token (EXECUTION_TOKEN_SECRET / EXECUTION_TOKEN_TTL_SECONDS).
export async function POST() {
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}
