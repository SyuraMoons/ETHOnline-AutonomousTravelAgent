import { NextResponse } from "next/server";

// TODO Phase 1: parse the free-text brief via one bounded LLM call (the LLM
// never touches money or sees a price), discover the supplier, quote via
// GET /v1/flights/search, run checkMandate() per leg, pay-or-refuse, then
// stream the loop as SSE (NEXT_PUBLIC_TRANSPORT=sse|poll). Compute
// itineraryHash from @sh/contracts once legs are finalized.
export async function POST() {
  return NextResponse.json({ status: "not_implemented" }, { status: 501 });
}
