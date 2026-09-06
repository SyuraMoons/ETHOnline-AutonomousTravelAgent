import { NextResponse } from "next/server";

// TODO Phase 1: create a Mandate (total/per-tx/expiry ceilings) scoped to a
// verified World ID nullifier hash.
export async function POST() {
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}
