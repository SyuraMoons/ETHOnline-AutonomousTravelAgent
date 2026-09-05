import { NextResponse } from "next/server";

// TODO Phase 1: create a Mandate (ceilings, expiry) scoped to a verified
// World ID nullifier hash.
export async function POST() {
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}
