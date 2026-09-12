import { createHash } from "node:crypto";
import type { PlanInput } from "./plan.js";

// Deterministic JSON: object keys sorted, no whitespace. This is the input to
// itineraryHash(), so any drift here silently changes every hash — treat the
// output format as frozen.
//
// Rules (deliberately stricter than JSON.stringify):
//  - object keys are sorted; array order is preserved (arrays are ordered data)
//  - `undefined` object values are dropped, as JSON.stringify does
//  - NaN/Infinity throw instead of becoming `null` — a hash anchor must never
//    silently accept a corrupt number
//  - anything not a JSON primitive/array/plain object throws (Date, BigInt,
//    Map, class instances): pass ISO strings and plain data, not objects that
//    happen to have a toJSON()
//
// Keys sort by UTF-16 code unit (JS default). Every value we hash is ASCII
// (IATA codes, ISO-8601 timestamps, ISO-4217 currencies), so this matches
// byte order; if this is ever reimplemented in another language, sort by
// UTF-8 bytes there and the two agree.
export function canonicalJson(obj: unknown): string {
  if (obj === undefined) {
    throw new TypeError(
      "canonicalJson: cannot serialize undefined at the top level",
    );
  }
  return write(obj);
}

function write(value: unknown): string {
  if (value === undefined) {
    throw new TypeError("canonicalJson: cannot serialize undefined");
  }
  if (value === null) return "null";

  switch (typeof value) {
    case "string":
      // JSON.stringify owns string escaping — do not hand-roll it.
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(
          `canonicalJson: refusing to serialize non-finite number ${value}`,
        );
      }
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
  }

  if (Array.isArray(value)) {
    // Array order is meaningful, so it is preserved.
    return `[${value.map(write).join(",")}]`;
  }

  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError(
      "canonicalJson: only plain objects, arrays and JSON primitives are supported",
    );
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  );

  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${write(v)}`).join(",")}}`;
}

// The unforgeability anchor. Binds a human's World ID approval to one exact
// itinerary — see AGENTS.md "Itinerary hash".
//
//   itineraryHash = "0x" + sha256(canonicalJson({ legs, paxCount, fareTotalMinor }))
//
// Only the four fields below go into a leg. Everything else a supplier returns
// (airline, seatsAvailable, arriveUtc, …) is presentational and must NOT affect
// the hash, or a cosmetic upstream change would invalidate a valid approval.
//
// Recomputed server-side at consent-verify and again at execute. NEVER trust a
// client-sent hash: /api/execute re-derives it and rejects a mismatch as
// ActionRefused · itinerary_mismatch.
//
// Uses node:crypto, so callers must run on the Node runtime (not the Edge
// runtime) — in Next.js that means `export const runtime = "nodejs"`.
export function itineraryHash(plan: PlanInput): string {
  const canonical = canonicalJson({
    legs: plan.legs.map((leg) => ({
      offerId: leg.offerId,
      departUtc: leg.departUtc,
      priceMinor: leg.priceMinor,
      currency: leg.currency,
    })),
    paxCount: plan.paxCount,
    fareTotalMinor: plan.fareTotalMinor,
  });

  return `0x${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}
