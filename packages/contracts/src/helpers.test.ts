import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalJson, itineraryHash } from "./helpers.js";
import type { PlanInput } from "./plan.js";
import type { SearchResult } from "./flights.js";

const leg = (over: Partial<SearchResult> = {}): SearchResult => ({
  offerId: "flt_001",
  origin: "SIN",
  destination: "NRT",
  departUtc: "2026-10-12T01:20:00.000Z",
  arriveUtc: "2026-10-12T09:05:00.000Z",
  airline: "ANA",
  flightNumber: "NH845",
  priceMinor: 42500,
  currency: "USD",
  seatsAvailable: 9,
  ...over,
});

const plan = (over: Partial<PlanInput> = {}): PlanInput => ({
  planId: "plan_demo",
  legs: [leg()],
  paxCount: 2,
  fareTotalMinor: 85000,
  currency: "USD",
  refusals: [],
  createdAt: "2026-09-10T00:00:00.000Z",
  ...over,
});

describe("canonicalJson", () => {
  it("sorts object keys and emits no whitespace", () => {
    assert.equal(canonicalJson({ b: 1, a: 2, c: 3 }), '{"a":2,"b":1,"c":3}');
  });

  it("sorts keys at every depth", () => {
    assert.equal(canonicalJson({ z: { y: 1, x: 2 } }), '{"z":{"x":2,"y":1}}');
  });

  it("produces identical output regardless of key insertion order", () => {
    assert.equal(
      canonicalJson({ a: 1, b: { c: 2, d: 3 } }),
      canonicalJson({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it("preserves array order, because arrays are ordered data", () => {
    assert.equal(canonicalJson([3, 1, 2]), "[3,1,2]");
    assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
  });

  it("drops undefined object values, as JSON.stringify does", () => {
    assert.equal(canonicalJson({ a: 1, b: undefined }), '{"a":1}');
  });

  it("writes undefined array holes as null, as JSON.stringify does", () => {
    assert.equal(canonicalJson([1, undefined, 2]), "[1,null,2]");
  });

  it("escapes strings correctly", () => {
    assert.equal(canonicalJson({ s: 'a"b\\c\nd' }), '{"s":"a\\"b\\\\c\\nd"}');
  });

  it("handles null and empty containers", () => {
    assert.equal(canonicalJson(null), "null");
    assert.equal(canonicalJson({}), "{}");
    assert.equal(canonicalJson([]), "[]");
  });

  it("refuses non-finite numbers instead of silently writing null", () => {
    assert.throws(() => canonicalJson({ n: NaN }), TypeError);
    assert.throws(() => canonicalJson({ n: Infinity }), TypeError);
    assert.throws(() => canonicalJson({ n: -Infinity }), TypeError);
  });

  it("refuses top-level undefined", () => {
    assert.throws(() => canonicalJson(undefined), TypeError);
  });

  it("refuses non-plain objects rather than guessing at a serialization", () => {
    assert.throws(() => canonicalJson({ d: new Date() }), TypeError);
    assert.throws(() => canonicalJson({ m: new Map() }), TypeError);
    assert.throws(() => canonicalJson({ b: 1n }), TypeError);
    class Thing {
      x = 1;
    }
    assert.throws(() => canonicalJson({ t: new Thing() }), TypeError);
  });
});

describe("itineraryHash", () => {
  it("returns 0x-prefixed sha256 hex", () => {
    assert.match(itineraryHash(plan()), /^0x[0-9a-f]{64}$/);
  });

  // Locks the wire format. If this fails, the hash format changed and every
  // previously issued World ID approval is invalidated — that must be deliberate.
  it("matches the known-good hash for a fixed plan", () => {
    assert.equal(
      itineraryHash(plan()),
      "0xa75d3288caa3f227b995f6b17f3f1d26a0e0956442b82241668ee1e2daa12bcc",
    );
  });

  it("is stable across leg key insertion order", () => {
    const reordered = {
      seatsAvailable: 9,
      currency: "USD",
      priceMinor: 42500,
      flightNumber: "NH845",
      airline: "ANA",
      arriveUtc: "2026-10-12T09:05:00.000Z",
      departUtc: "2026-10-12T01:20:00.000Z",
      destination: "NRT",
      origin: "SIN",
      offerId: "flt_001",
    } as SearchResult;
    assert.equal(
      itineraryHash(plan({ legs: [reordered] })),
      itineraryHash(plan()),
    );
  });

  // The whole point of hashing a subset: a supplier renaming an airline or
  // updating a seat count must not invalidate a human's approval.
  it("ignores presentational leg fields", () => {
    const cosmetic = plan({
      legs: [
        leg({
          airline: "All Nippon Airways",
          seatsAvailable: 1,
          flightNumber: "NH999",
          arriveUtc: "2026-10-12T10:00:00.000Z",
          origin: "XXX",
          destination: "YYY",
        }),
      ],
    });
    assert.equal(itineraryHash(cosmetic), itineraryHash(plan()));
  });

  // ...but everything that is economically material must change it.
  it("changes when a price changes", () => {
    assert.notEqual(
      itineraryHash(plan({ legs: [leg({ priceMinor: 42501 })] })),
      itineraryHash(plan()),
    );
  });

  it("changes when the offer changes", () => {
    assert.notEqual(
      itineraryHash(plan({ legs: [leg({ offerId: "flt_002" })] })),
      itineraryHash(plan()),
    );
  });

  it("changes when the departure time changes", () => {
    assert.notEqual(
      itineraryHash(
        plan({ legs: [leg({ departUtc: "2026-10-12T01:21:00.000Z" })] }),
      ),
      itineraryHash(plan()),
    );
  });

  it("changes when the currency changes", () => {
    assert.notEqual(
      itineraryHash(plan({ legs: [leg({ currency: "SGD" })] })),
      itineraryHash(plan()),
    );
  });

  it("changes when passenger count changes", () => {
    assert.notEqual(
      itineraryHash(plan({ paxCount: 3 })),
      itineraryHash(plan()),
    );
  });

  it("changes when the fare total changes", () => {
    assert.notEqual(
      itineraryHash(plan({ fareTotalMinor: 85001 })),
      itineraryHash(plan()),
    );
  });

  it("changes when leg order changes, so an outbound cannot be swapped for a return", () => {
    const a = leg({ offerId: "flt_001" });
    const b = leg({ offerId: "flt_002" });
    assert.notEqual(
      itineraryHash(plan({ legs: [a, b] })),
      itineraryHash(plan({ legs: [b, a] })),
    );
  });

  it("distinguishes a dropped leg from a kept one", () => {
    assert.notEqual(
      itineraryHash(plan({ legs: [leg(), leg({ offerId: "flt_002" })] })),
      itineraryHash(plan()),
    );
  });
});
