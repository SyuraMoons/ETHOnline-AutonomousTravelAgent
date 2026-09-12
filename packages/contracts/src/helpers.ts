import { createHash } from "node:crypto";
import type { PlanInput } from "./plan.js";

// Deterministic key-sorted JSON stringify (no whitespace, stable key order) —
// the input to itineraryHash(). Arrays keep their order; only plain-object
// keys are sorted. Rejects undefined/function/NaN values rather than
// silently dropping them (JSON.stringify would drop object keys and turn
// array entries into null, which would make the hash ambiguous).
export function canonicalJson(obj: unknown): string {
  return stringify(obj);
}

function stringify(value: unknown): string {
  if (value === undefined || typeof value === "function") {
    throw new Error(`canonicalJson: unsupported value of type ${typeof value}`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error(`canonicalJson: unsupported non-finite number ${value}`);
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries = keys.map(key => `${JSON.stringify(key)}:${stringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  throw new Error(`canonicalJson: unsupported value of type ${typeof value}`);
}

// itineraryHash = "0x" + sha256(canonicalJson({legs, paxCount, fareTotalMinor}))
// (see AGENTS.md "Itinerary hash"). Recomputed server-side at consent-verify
// and at execute — NEVER trust a client-sent hash. /api/execute must reject
// mismatches as ActionRefused · itinerary_mismatch.
export function itineraryHash(plan: PlanInput): string {
  const canonical = canonicalJson({
    legs: plan.legs.map(l => ({
      offerId: l.offerId,
      departUtc: l.departUtc,
      priceMinor: l.priceMinor,
      currency: l.currency,
    })),
    paxCount: plan.paxCount,
    fareTotalMinor: plan.fareTotalMinor,
  });
  return `0x${createHash("sha256").update(canonical).digest("hex")}`;
}
