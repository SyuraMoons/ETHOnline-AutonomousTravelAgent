import { NextResponse } from "next/server";

// TODO Phase 1: run the planner against the active mandate + supplier search
// results, compute itineraryHash from packages/contracts.
// TODO: convert to text/event-stream in Phase 2
export async function POST() {
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}
