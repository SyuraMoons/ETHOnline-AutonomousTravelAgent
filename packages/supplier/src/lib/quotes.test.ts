import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { createQuoteCache } from "./quotes.js";
import { priceTinybars } from "./pricing.js";

interface Q {
  city: string;
  n: number;
}

let resolveCalls = 0;
const rows = (query: Q) =>
  Array.from({ length: query.n }, (_, i) => `${query.city}-${i}`);

function cache(namespace = "test") {
  resolveCalls = 0;
  return createQuoteCache<Q, string>({
    namespace,
    resolve: (query) => {
      resolveCalls += 1;
      return rows(query);
    },
    identity: (query) => ({
      city: query.city.trim().toUpperCase(),
      n: query.n,
    }),
  });
}

describe("quote cache", () => {
  let c: ReturnType<typeof cache>;
  beforeEach(() => {
    c = cache();
  });

  it("returns the same quote for the same query", () => {
    const a = c.getOrCreate({ city: "NRT", n: 3 });
    const b = c.getOrCreate({ city: "NRT", n: 3 });
    assert.equal(a.quoteId, b.quoteId);
  });

  it("resolves rows once, not per request", () => {
    c.getOrCreate({ city: "NRT", n: 3 });
    c.getOrCreate({ city: "NRT", n: 3 });
    c.getOrCreate({ city: "NRT", n: 3 });
    assert.equal(resolveCalls, 1);
  });

  it("normalises the query through identity()", () => {
    const a = c.getOrCreate({ city: " nrt ", n: 3 });
    const b = c.getOrCreate({ city: "NRT", n: 3 });
    assert.equal(a.quoteId, b.quoteId);
  });

  it("separates different queries", () => {
    const a = c.getOrCreate({ city: "NRT", n: 3 });
    const b = c.getOrCreate({ city: "DPS", n: 3 });
    assert.notEqual(a.quoteId, b.quoteId);
  });

  // Two domains can produce structurally identical queries once normalised.
  // Serving one from the other's quote would hand the buyer the wrong rows.
  it("never lets two namespaces share a quote", () => {
    const stays = cache("stays");
    const activities = cache("activities");
    const a = stays.getOrCreate({ city: "NRT", n: 3 });
    const b = activities.getOrCreate({ city: "NRT", n: 3 });
    assert.notEqual(a.quoteId, b.quoteId);
    assert.equal(stays.size(), 1);
    assert.equal(activities.size(), 1);
  });

  it("starts unpaid at the short TTL", () => {
    const quote = c.getOrCreate({ city: "NRT", n: 3 });
    assert.equal(quote.paid, false);
    const ttlSeconds = (quote.expiresAt - Date.now()) / 1000;
    assert.ok(
      ttlSeconds > 290 && ttlSeconds <= 300,
      `unpaid TTL was ${ttlSeconds}s`,
    );
  });

  it("extends the TTL once paid", () => {
    const before = c.getOrCreate({ city: "NRT", n: 3 }).expiresAt;
    const paid = c.markPaid({ city: "NRT", n: 3 });
    assert.equal(paid.paid, true);
    assert.ok(paid.expiresAt > before);
    const ttlSeconds = (paid.expiresAt - Date.now()) / 1000;
    assert.ok(
      ttlSeconds > 890 && ttlSeconds <= 900,
      `paid TTL was ${ttlSeconds}s`,
    );
  });

  it("keeps the same rows across the pay boundary", () => {
    const challenged = c.getOrCreate({ city: "NRT", n: 5 });
    const served = c.markPaid({ city: "NRT", n: 5 });
    assert.equal(served.quoteId, challenged.quoteId);
    assert.deepEqual(served.results, challenged.results);
  });

  // The invariant the whole cache exists for: a buyer is quoted on a row count,
  // so the count priced in the 402 must equal the count they receive.
  it("prices the 402 on exactly the rows the paid response returns", () => {
    for (const n of [0, 1, 7, 40, 200]) {
      const challenged = c.getOrCreate({ city: "NRT", n });
      const quotedPrice = priceTinybars("stays", challenged.results.length);
      const served = c.markPaid({ city: "NRT", n });
      assert.equal(served.results.length, challenged.results.length);
      assert.equal(priceTinybars("stays", served.results.length), quotedPrice);
    }
  });
});

describe("price bands", () => {
  it("charges the floor for an empty result set", () => {
    // A malformed or empty search still shows a price in the 402 body.
    assert.equal(priceTinybars("stays", 0), priceTinybars("stays", 1));
  });

  it("rises with the row count between floor and cap", () => {
    assert.ok(
      priceTinybars("activities", 30) > priceTinybars("activities", 10),
    );
  });

  it("stops at the cap", () => {
    assert.equal(
      priceTinybars("activities", 500),
      priceTinybars("activities", 5000),
    );
    assert.equal(priceTinybars("activities", 5000), 100_000_000n); // 1.00 HBAR
  });

  it("prices the domains differently", () => {
    const n = 20;
    assert.notEqual(priceTinybars("flights", n), priceTinybars("stays", n));
    assert.notEqual(priceTinybars("stays", n), priceTinybars("activities", n));
  });
});
