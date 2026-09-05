import type { PlanInput } from "./plan.js";

// TODO Phase 1: deterministic key-sorted JSON stringify (no whitespace,
// stable key order) — the input to itineraryHash().
export function canonicalJson(obj: unknown): string {
  throw new Error("not implemented");
}

// TODO Phase 1. Formula (see AGENTS.md "Itinerary hash"):
//   itineraryHash = "0x" + sha256(canonicalJson({
//     legs: plan.legs.map(l => ({ offerId: l.offerId, departUtc: l.departUtc, priceMinor: l.priceMinor, currency: l.currency })),
//     paxCount: plan.paxCount,
//     fareTotalMinor: plan.fareTotalMinor,
//   }))
// Recomputed server-side at consent-verify and at execute — NEVER trust a
// client-sent hash. /api/execute must reject mismatches as
// ActionRefused · itinerary_mismatch.
export function itineraryHash(plan: PlanInput): string {
  throw new Error("not implemented");
}
