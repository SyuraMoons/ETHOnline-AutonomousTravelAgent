import type { PlanInput } from "./plan.js";

// TODO Phase 1: deterministic key-sorted JSON stringify, used as the input to itineraryHash.
export function canonicalJson(obj: unknown): string {
  throw new Error("not implemented");
}

// TODO Phase 1: hash canonicalJson(plan) (e.g. keccak256) to produce the itinerary hash
// that gates the World ID consent flow and the /api/execute call.
export function itineraryHash(plan: PlanInput): string {
  throw new Error("not implemented");
}
