import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { priceTinybars } from "./pricing.js";
import { stayQuotes } from "./staySearch.js";
import { activityQuotes } from "./activitySearch.js";

/**
 * Covers everything about the two new paid routes that does not require money
 * to move: the quote each query resolves to, and the price that quote implies.
 *
 * The HTTP path itself (402 body, settlement, paid retry) needs a live
 * facilitator, so it is exercised end-to-end once bring-up is done rather than
 * mocked here — a mocked facilitator would prove the mock, not the payment.
 */

const STAY = { city: "NRT", checkIn: "2026-11-12", checkOut: "2026-11-15" };
const ACT = { city: "DPS", date: "2026-11-13" };

beforeEach(() => {
  stayQuotes.clear();
  activityQuotes.clear();
});

describe("stays route quoting", () => {
  it("resolves real inventory", () => {
    const quote = stayQuotes.getOrCreate(STAY);
    assert.ok(quote.results.length > 5);
    assert.ok(quote.results.every((offer) => offer.city === "NRT"));
  });

  it("prices the whole stay, not one night", () => {
    const offer = stayQuotes.getOrCreate(STAY).results[0]!;
    assert.equal(offer.nights, 3);
    assert.ok(offer.priceMinor > offer.nightlyPriceMinor * 2);
  });

  it("charges more for more properties", () => {
    const all = stayQuotes.getOrCreate(STAY).results.length;
    const luxury = stayQuotes.getOrCreate({ ...STAY, minStars: 5 }).results
      .length;
    assert.notEqual(all, luxury);
    assert.ok(priceTinybars("stays", all) > priceTinybars("stays", luxury));
  });

  // Omitting a filter from the cache key would serve a budget search from an
  // unfiltered quote — the buyer would pay the cheap price and get the wrong rows.
  it("treats each filter as a distinct search", () => {
    const base = stayQuotes.getOrCreate(STAY);
    for (const variant of [
      { minStars: 4 },
      { guests: 4 },
      { maxTotalMinor: 40000 },
    ]) {
      const other = stayQuotes.getOrCreate({ ...STAY, ...variant });
      assert.notEqual(
        other.quoteId,
        base.quoteId,
        `${JSON.stringify(variant)} shared a quote`,
      );
    }
  });

  it("normalises a lower-case city onto the same quote", () => {
    const a = stayQuotes.getOrCreate(STAY);
    const b = stayQuotes.getOrCreate({ ...STAY, city: "nrt" });
    assert.equal(a.quoteId, b.quoteId);
  });

  it("returns an empty quote for a city with no inventory", () => {
    assert.deepEqual(
      stayQuotes.getOrCreate({ ...STAY, city: "XXX" }).results,
      [],
    );
  });
});

describe("activities route quoting", () => {
  it("returns one row per start time, not per experience", () => {
    const quote = activityQuotes.getOrCreate(ACT);
    const distinct = new Set(
      quote.results.map((offer) => offer.activityId.split("@")[0]),
    );
    assert.ok(
      quote.results.length > distinct.size,
      "slots should outnumber experiences",
    );
  });

  it("filters by pace", () => {
    const calm = activityQuotes.getOrCreate({ ...ACT, pace: "calm" });
    assert.ok(calm.results.length > 0);
    assert.ok(calm.results.every((offer) => offer.pace === "calm"));
  });

  it("treats each filter as a distinct search", () => {
    const base = activityQuotes.getOrCreate(ACT);
    for (const variant of [
      { pace: "calm" as const },
      { maxPriceMinor: 4000 },
      { indoor: true },
    ]) {
      const other = activityQuotes.getOrCreate({ ...ACT, ...variant });
      assert.notEqual(
        other.quoteId,
        base.quoteId,
        `${JSON.stringify(variant)} shared a quote`,
      );
    }
  });

  // The meter has to visibly move, or the metering reads as decoration.
  it("prices a filtered search below the cap and an unfiltered one at it", () => {
    const all = activityQuotes.getOrCreate(ACT).results.length;
    const calm = activityQuotes.getOrCreate({ ...ACT, pace: "calm" }).results
      .length;
    const cap = priceTinybars("activities", 100_000);
    assert.equal(
      priceTinybars("activities", all),
      cap,
      "an unfiltered search should reach the cap",
    );
    assert.ok(
      priceTinybars("activities", calm) < cap,
      "a pace-filtered search should sit below it",
    );
  });
});

describe("cross-domain isolation", () => {
  // Both caches key on a normalised { city, ... }. Without the namespace in the
  // key, a stay search and an activity search for the same city could collide.
  it("never lets a stay query resolve an activity quote", () => {
    const stay = stayQuotes.getOrCreate({ ...STAY, city: "DPS" });
    const act = activityQuotes.getOrCreate(ACT);
    assert.notEqual(stay.quoteId, act.quoteId);
    assert.ok("nights" in stay.results[0]!);
    assert.ok("startUtc" in act.results[0]!);
  });

  it("prices the three domains differently for the same row count", () => {
    const n = 20;
    const prices = new Set([
      priceTinybars("flights", n),
      priceTinybars("stays", n),
      priceTinybars("activities", n),
    ]);
    assert.equal(prices.size, 3);
  });
});
