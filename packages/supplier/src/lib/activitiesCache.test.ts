import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadCachedActivities, searchActivities } from "./activitiesCache.js";

const DATE = "2026-11-13";

describe("activity catalogue", () => {
  it("is present and non-trivial", () => {
    assert.ok(loadCachedActivities().length > 100);
  });

  it("has unique activity ids", () => {
    const ids = loadCachedActivities().map((activity) => activity.activityId);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("never repeats the same experience name within a city", () => {
    const seen = new Set<string>();
    for (const activity of loadCachedActivities()) {
      const key = `${activity.city}|${activity.name}`;
      assert.ok(!seen.has(key), `duplicate experience ${key}`);
      seen.add(key);
    }
  });

  // The realism constraints. These are what stop the dataset reading as
  // machine-generated at a glance.
  it("only runs sunrise and dawn activities before 07:00", () => {
    for (const activity of loadCachedActivities()) {
      if (!/sunrise|dawn/i.test(activity.name)) continue;
      assert.ok(
        activity.startTimes.every((time) => time < "07:00"),
        `${activity.name} starts at ${activity.startTimes.join(", ")}`,
      );
    }
  });

  it("only runs night markets after 19:00", () => {
    for (const activity of loadCachedActivities()) {
      if (!/night market deep dive/i.test(activity.name)) continue;
      assert.ok(
        activity.startTimes.every((time) => time >= "19:00"),
        `${activity.name} starts at ${activity.startTimes.join(", ")}`,
      );
    }
  });

  it("never puts water activities in a landlocked city", () => {
    // Bangkok has no coast in the place table, so it must offer no sea kayaking
    // or surfing rather than relocating them inland.
    const bangkokWater = loadCachedActivities().filter(
      (activity) =>
        activity.city === "BKK" && /kayak|surf/i.test(activity.name),
    );
    assert.deepEqual(bangkokWater, []);
  });

  it("gives every city at least one option at every pace it offers", () => {
    const cities = new Set(
      loadCachedActivities().map((activity) => activity.city),
    );
    for (const city of cities) {
      const paces = new Set(
        loadCachedActivities()
          .filter((a) => a.city === city)
          .map((a) => a.pace),
      );
      assert.ok(
        paces.size >= 2,
        `${city} offers only ${[...paces].join(", ")}`,
      );
    }
  });
});

describe("searchActivities", () => {
  it("returns one row per start time, not per activity", () => {
    const catalogue = loadCachedActivities().filter(
      (activity) => activity.city === "NRT",
    );
    const slots = catalogue.reduce(
      (total, activity) => total + activity.startTimes.length,
      0,
    );
    assert.equal(searchActivities({ city: "NRT", date: DATE }).length, slots);
  });

  it("filters by pace", () => {
    const offers = searchActivities({ city: "DPS", date: DATE, pace: "calm" });
    assert.ok(offers.length > 0);
    assert.ok(offers.every((offer) => offer.pace === "calm"));
  });

  it("filters by price ceiling", () => {
    const offers = searchActivities({
      city: "DPS",
      date: DATE,
      maxPriceMinor: 4000,
    });
    assert.ok(offers.every((offer) => offer.priceMinor <= 4000));
  });

  it("filters by indoor", () => {
    const offers = searchActivities({ city: "SIN", date: DATE, indoor: true });
    assert.ok(offers.every((offer) => offer.indoor));
  });

  it("converts local start times to UTC using the city offset", () => {
    // Tokyo is UTC+9, so nothing on 13 Nov local starts before 12 Nov 15:00Z.
    const offers = searchActivities({ city: "NRT", date: DATE });
    assert.ok(
      offers.every((offer) => offer.startUtc >= "2026-11-12T15:00:00.000Z"),
    );
  });

  it("sorts by start time", () => {
    const offers = searchActivities({ city: "BKK", date: DATE });
    for (let i = 1; i < offers.length; i += 1) {
      assert.ok(offers[i]!.startUtc >= offers[i - 1]!.startUtc);
    }
  });

  it("returns nothing for a city with no inventory", () => {
    assert.deepEqual(searchActivities({ city: "XXX", date: DATE }), []);
  });

  it("gives different row counts for different paces, so the meter moves", () => {
    const calm = searchActivities({
      city: "DPS",
      date: DATE,
      pace: "calm",
    }).length;
    const adventurous = searchActivities({
      city: "DPS",
      date: DATE,
      pace: "adventurous",
    }).length;
    assert.notEqual(calm, adventurous);
  });
});
