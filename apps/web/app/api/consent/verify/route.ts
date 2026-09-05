import { NextResponse } from "next/server";

// TODO Phase 1: verify the World ID proof (WORLD_API_KEY), confirm it's bound
// to the exact itineraryHash, mint an execution token (EXECUTION_TOKEN_SECRET).
export async function POST() {
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}
