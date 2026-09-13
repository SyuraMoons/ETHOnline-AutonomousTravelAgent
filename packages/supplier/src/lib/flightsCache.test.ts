import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { localDepartureDate } from "./airports.js";
import { searchFlights } from "./flightsCache.js";

// These run against the committed data/cache/flights.json, so they also serve
// as a smoke test that the cache is present and well-formed.

describe("localDepartureDate", () => {
  it("returns the local date, not the UTC date", () => {
    // 22:45Z on the 14th is 06:45 on the 15th in Singapore (UTC+8).
    assert.equal(
      localDepartureDate("2026-09-14T22:45:00.000Z", "SIN"),
      "2026-09-15",
    );
  });

  it("agrees with UTC where the offset does not cross midnight", () => {
    assert.equal(
      localDepartureDate("2026-09-15T03:30:00.000Z", "SIN"),
      "2026-09-15",
    );
  });

  it("treats an unknown airport as UTC rather than guessing", () => {
    assert.equal(
      localDepartureDate("2026-09-14T22:45:00.000Z", "ZZZ"),
      "2026-09-14",
    );
  });

  it("throws on an invalid timestamp", () => {
    assert.throws(() => localDepartureDate("not-a-date", "SIN"), TypeError);
  });
});

describe("searchFlights", () => {
  it("returns the whole cache when unfiltered", () => {
    assert.ok(searchFlights().length > 100);
  });

  it("filters by route", () => {
    const rows = searchFlights({ origin: "SIN", destination: "CGK" });
    assert.ok(rows.length > 0);
    assert.ok(rows.every((r) => r.origin === "SIN" && r.destination === "CGK"));
  });

  it("accepts lower-case airport codes", () => {
    assert.deepEqual(
      searchFlights({ origin: "sin", destination: "cgk" }),
      searchFlights({ origin: "SIN", destination: "CGK" }),
    );
  });

  // The bug this filter exists to avoid: an early-morning departure is stored
  // as the previous UTC day, and a UTC-date filter would hide it.
  it("includes early-morning departures stored on the previous UTC date", () => {
    const all = searchFlights({ origin: "SIN", destination: "CGK" });
    const spilled = all.find(
      (r) =>
        r.departUtc.slice(0, 10) !== localDepartureDate(r.departUtc, r.origin),
    );
    assert.ok(
      spilled,
      "expected at least one departure whose UTC date differs from its local date",
    );

    const sameDay = searchFlights({
      origin: "SIN",
      destination: "CGK",
      departDate: localDepartureDate(spilled.departUtc, spilled.origin),
    });
    assert.ok(
      sameDay.some((r) => r.offerId === spilled.offerId),
      "local-date search must return the spilled flight",
    );
  });

  it("returns every row for a date on its local departure date", () => {
    const date = localDepartureDate(
      searchFlights({ origin: "SIN", destination: "CGK" })[0]!.departUtc,
      "SIN",
    );
    const rows = searchFlights({
      origin: "SIN",
      destination: "CGK",
      departDate: date,
    });
    assert.ok(rows.length >= 2);
    assert.ok(
      rows.every((r) => localDepartureDate(r.departUtc, r.origin) === date),
    );
  });

  it("returns nothing for a date outside the generated window", () => {
    assert.deepEqual(
      searchFlights({
        origin: "SIN",
        destination: "CGK",
        departDate: "1999-01-01",
      }),
      [],
    );
  });

  it("sorts cheapest first, which is the order the buyer is priced on", () => {
    const rows = searchFlights({ origin: "SIN", destination: "NRT" });
    for (let i = 1; i < rows.length; i += 1) {
      assert.ok(rows[i]!.priceMinor >= rows[i - 1]!.priceMinor);
    }
  });

  it("covers both directions, so a round trip can be planned", () => {
    assert.ok(searchFlights({ origin: "CGK", destination: "SIN" }).length > 0);
    assert.ok(searchFlights({ origin: "SIN", destination: "CGK" }).length > 0);
  });
});
