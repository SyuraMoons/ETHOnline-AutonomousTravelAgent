import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadCachedStays, nightlyRate, searchStays } from "./staysCache.js";

// Run against the committed data/cache/hotels.json, so these also smoke-test
// that the cache is present and well-formed.

const CHECK_IN = "2026-11-12";
const CHECK_OUT = "2026-11-15";

describe("stay catalogue", () => {
  it("is present and non-trivial", () => {
    assert.ok(loadCachedStays().length > 100);
  });

  it("has unique hotel ids", () => {
    const ids = loadCachedStays().map((stay) => stay.hotelId);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("never names the same property twice in one city", () => {
    const seen = new Set<string>();
    for (const stay of loadCachedStays()) {
      const key = `${stay.city}|${stay.name}|${stay.area}`;
      assert.ok(!seen.has(key), `duplicate property ${key}`);
      seen.add(key);
    }
  });
});

describe("nightlyRate", () => {
  it("is stable for the same hotel and date", () => {
    const stay = loadCachedStays()[0]!;
    assert.equal(nightlyRate(stay, CHECK_IN), nightlyRate(stay, CHECK_IN));
  });

  it("differs across dates", () => {
    const stay = loadCachedStays()[0]!;
    const rates = new Set(
      ["2026-11-12", "2026-11-13", "2026-11-14"].map((date) =>
        nightlyRate(stay, date),
      ),
    );
    assert.ok(
      rates.size > 1,
      "every night priced identically would make the weekend premium invisible",
    );
  });

  it("charges more on a Friday night than the Tuesday before", () => {
    // 2026-11-13 is a Friday, 2026-11-10 a Tuesday.
    const dearer = loadCachedStays().filter(
      (stay) =>
        nightlyRate(stay, "2026-11-13") > nightlyRate(stay, "2026-11-10"),
    );
    assert.ok(
      dearer.length > loadCachedStays().length * 0.6,
      "weekend premium should dominate the jitter",
    );
  });
});

describe("searchStays", () => {
  it("returns offers for a covered city", () => {
    const offers = searchStays({
      city: "NRT",
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
    });
    assert.ok(offers.length > 5);
    assert.ok(offers.every((offer) => offer.city === "NRT"));
  });

  it("accepts a lower-case city code", () => {
    assert.deepEqual(
      searchStays({ city: "nrt", checkIn: CHECK_IN, checkOut: CHECK_OUT }),
      searchStays({ city: "NRT", checkIn: CHECK_IN, checkOut: CHECK_OUT }),
    );
  });

  it("prices the whole stay, not one night", () => {
    const offer = searchStays({
      city: "NRT",
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
    })[0]!;
    assert.equal(offer.nights, 3);
    assert.ok(offer.priceMinor > offer.nightlyPriceMinor * 2);
  });

  it("sets check-in and check-out to local afternoon and morning", () => {
    const offer = searchStays({
      city: "NRT",
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
    })[0]!;
    // Tokyo is UTC+9, so 15:00 local is 06:00Z and 11:00 local is 02:00Z.
    assert.ok(offer.checkInUtc.startsWith("2026-11-12T06:00"));
    assert.ok(offer.checkOutUtc.startsWith("2026-11-15T02:00"));
  });

  it("filters by star rating", () => {
    const offers = searchStays({
      city: "DPS",
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      minStars: 4,
    });
    assert.ok(offers.length > 0);
    assert.ok(offers.every((offer) => offer.starRating >= 4));
  });

  it("filters by guest count", () => {
    const offers = searchStays({
      city: "DPS",
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      guests: 4,
    });
    assert.ok(offers.every((offer) => offer.priceMinor > 0));
    assert.ok(
      offers.length <
        searchStays({ city: "DPS", checkIn: CHECK_IN, checkOut: CHECK_OUT })
          .length,
    );
  });

  it("filters on the total, not the nightly rate", () => {
    const budget = 40000;
    const offers = searchStays({
      city: "KUL",
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      maxTotalMinor: budget,
    });
    assert.ok(offers.every((offer) => offer.priceMinor <= budget));
  });

  it("sorts cheapest first, the order the buyer is priced on", () => {
    const offers = searchStays({
      city: "SIN",
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
    });
    for (let i = 1; i < offers.length; i += 1) {
      assert.ok(offers[i]!.priceMinor >= offers[i - 1]!.priceMinor);
    }
  });

  it("returns nothing for a city with no inventory", () => {
    assert.deepEqual(
      searchStays({ city: "XXX", checkIn: CHECK_IN, checkOut: CHECK_OUT }),
      [],
    );
  });

  it("refuses a check-out that is not after check-in", () => {
    assert.throws(
      () =>
        searchStays({ city: "NRT", checkIn: CHECK_OUT, checkOut: CHECK_IN }),
      RangeError,
    );
    assert.throws(
      () => searchStays({ city: "NRT", checkIn: CHECK_IN, checkOut: CHECK_IN }),
      RangeError,
    );
  });

  it("gives different row counts for different filters, so the meter moves", () => {
    const all = searchStays({
      city: "DPS",
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
    }).length;
    const luxury = searchStays({
      city: "DPS",
      checkIn: CHECK_IN,
      checkOut: CHECK_OUT,
      minStars: 5,
    }).length;
    assert.notEqual(all, luxury);
  });
});
