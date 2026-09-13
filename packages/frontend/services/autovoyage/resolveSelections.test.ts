import { resolveActivities, resolveStay } from "./resolveSelections";
import type { ActivityOffer, StayOffer } from "@sh/contracts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * These two functions are the boundary between what a language model claims and what a card
 * gets charged for. Everything they return ends up inside itineraryHash(), which a human then
 * approves — so an id the model invented must resolve to nothing here, not further down.
 */

const DATES = { checkIn: "2026-11-12", checkOut: "2026-11-15" };

const stayOffer: StayOffer = {
  hotelId: "htl_001",
  checkInUtc: "2026-11-12T07:00:00.000Z",
  checkOutUtc: "2026-11-15T03:00:00.000Z",
  priceMinor: 42_000,
  currency: "USD",
  name: "The Quiet Wing",
  city: "NRT",
  area: "Yanaka",
  starRating: 4,
  roomType: "Double",
  nights: 3,
  nightlyPriceMinor: 14_000,
  refundable: true,
  amenities: ["wifi"],
};

const activityOffer: ActivityOffer = {
  activityId: "act_001",
  startUtc: "2026-11-13T01:00:00.000Z",
  priceMinor: 6_500,
  currency: "USD",
  name: "Morning market walk",
  summary: "A slow loop through the market.",
  city: "NRT",
  category: "food",
  pace: "calm",
  durationMinutes: 120,
  indoor: false,
};

describe("resolveStay", () => {
  it("resolves a hotel the run actually paid for", () => {
    const stay = resolveStay([stayOffer], DATES, "htl_001");
    assert.equal(stay?.hotelId, "htl_001");
    assert.equal(stay?.priceMinor, 42_000);
  });

  it("carries BOTH the instants and the local dates", () => {
    // The instants are what itineraryHash consumes; the local dates are what POST /v1/booking
    // wants. Deriving one from the other is wrong wherever 15:00 local lands on the next UTC
    // day, so the dossier holds both.
    const stay = resolveStay([stayOffer], DATES, "htl_001");
    assert.equal(stay?.checkInUtc, "2026-11-12T07:00:00.000Z");
    assert.equal(stay?.checkIn, "2026-11-12");
    assert.equal(stay?.checkOut, "2026-11-15");
  });

  it("drops a hotelId that was never in the paid results", () => {
    // The model inventing a plausible id must not put a room on someone's card.
    assert.equal(resolveStay([stayOffer], DATES, "htl_999"), undefined);
  });

  it("drops a hotel when no stay search was paid for", () => {
    assert.equal(resolveStay([], DATES, "htl_001"), undefined);
    assert.equal(resolveStay([stayOffer], null, "htl_001"), undefined);
  });

  it("returns nothing when the model named no hotel", () => {
    assert.equal(resolveStay([stayOffer], DATES, null), undefined);
  });

  it("keeps no presentational field", () => {
    // Star rating and room name must not reach the hash: a supplier renaming a room would
    // otherwise invalidate an approval that is still perfectly valid.
    const stay = resolveStay([stayOffer], DATES, "htl_001");
    assert.deepEqual(Object.keys(stay ?? {}).sort(), [
      "checkIn",
      "checkInUtc",
      "checkOut",
      "checkOutUtc",
      "currency",
      "hotelId",
      "priceMinor",
    ]);
  });
});

describe("resolveActivities", () => {
  it("resolves the slots the run paid for", () => {
    const activities = resolveActivities([activityOffer], ["act_001"]);
    assert.equal(activities.length, 1);
    assert.equal(activities[0].startUtc, "2026-11-13T01:00:00.000Z");
  });

  it("drops ids that were never in the paid results", () => {
    assert.deepEqual(resolveActivities([activityOffer], ["act_999"]), []);
  });

  it("keeps only the real ones out of a mixed list", () => {
    const activities = resolveActivities([activityOffer], ["act_999", "act_001"]);
    assert.equal(activities.length, 1);
    assert.equal(activities[0].activityId, "act_001");
  });

  it("does not double-count a slot named twice", () => {
    // Twice in the list would be charged twice and hashed as two items.
    assert.equal(resolveActivities([activityOffer], ["act_001", "act_001"]).length, 1);
  });

  it("returns an empty list, never undefined, when nothing was chosen", () => {
    // TripDossier.activities is hashed as [] rather than omitted, so the empty case has to
    // be a real empty array — see itineraryHash.
    assert.deepEqual(resolveActivities([activityOffer], []), []);
  });
});
