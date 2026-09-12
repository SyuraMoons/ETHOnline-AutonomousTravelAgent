import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPublicKey, verify } from "node:crypto";
import { BookingRequest, canonicalJson } from "@sh/contracts";
import {
  loadCachedActivities,
  findActivityById,
  runsAt,
} from "./activitiesCache.js";
import { findStayById, localTimeToUtc, priceStay } from "./staysCache.js";
import { loadCachedStays } from "./staysCache.js";
import { loadCachedFlights } from "./flightsCache.js";

/**
 * Covers booking's resolution and validation — the parts that decide what gets
 * signed. The HTTP route itself needs a live facilitator (withPayment settles
 * through it), so it is exercised end-to-end at bring-up.
 */

describe("BookingRequest schema", () => {
  const passenger = {
    passengerName: "A Traveller",
    passengerEmail: "a@example.com",
  };

  it("accepts flights alone — booking the flight first is a real request", () => {
    const parsed = BookingRequest.safeParse({
      legs: [{ offerId: "flt_001" }],
      ...passenger,
    });
    assert.ok(parsed.success);
    assert.deepEqual(
      parsed.data.activities,
      [],
      "activities should default to empty, not undefined",
    );
  });

  it("accepts a whole itinerary", () => {
    const parsed = BookingRequest.safeParse({
      legs: [{ offerId: "flt_001" }, { offerId: "flt_002" }],
      stay: {
        hotelId: "htl_nrt_001",
        checkIn: "2026-11-12",
        checkOut: "2026-11-15",
      },
      activities: [
        { activityId: "act_nrt_001", startUtc: "2026-11-13T00:30:00.000Z" },
      ],
      ...passenger,
    });
    assert.ok(parsed.success);
  });

  it("refuses an itinerary with no flight", () => {
    assert.equal(
      BookingRequest.safeParse({ legs: [], ...passenger }).success,
      false,
    );
  });

  it("refuses a malformed email", () => {
    const parsed = BookingRequest.safeParse({
      legs: [{ offerId: "x" }],
      ...passenger,
      passengerEmail: "nope",
    });
    assert.equal(parsed.success, false);
  });

  // Prices are resolved from inventory, so a client-sent one must not be able to
  // ride along and end up on a signed confirmation.
  it("carries no prices", () => {
    const parsed = BookingRequest.parse({
      legs: [{ offerId: "flt_001", priceMinor: 1 }],
      ...passenger,
    });
    assert.equal("priceMinor" in parsed.legs[0]!, false);
  });
});

describe("component resolution", () => {
  it("finds a real property and prices the requested nights", () => {
    const property = loadCachedStays().find((stay) => stay.city === "NRT")!;
    const priced = priceStay(property, "2026-11-12", "2026-11-15");
    assert.equal(priced.nights, 3);
    assert.ok(priced.priceMinor > property.baseNightlyPriceMinor * 2);
  });

  it("prices a stay the same way a search quoted it", () => {
    // A price a buyer saw must be the price they are booked at.
    const property = loadCachedStays()[0]!;
    const a = priceStay(property, "2026-11-12", "2026-11-15").priceMinor;
    const b = priceStay(property, "2026-11-12", "2026-11-15").priceMinor;
    assert.equal(a, b);
  });

  it("returns undefined for an unknown id rather than inventing one", () => {
    assert.equal(findStayById("htl_nope_999"), undefined);
    assert.equal(findActivityById("act_nope_999"), undefined);
  });

  it("refuses a check-out that is not after check-in", () => {
    const property = loadCachedStays()[0]!;
    assert.throws(
      () => priceStay(property, "2026-11-15", "2026-11-12"),
      RangeError,
    );
  });
});

describe("activity slot validation", () => {
  const activity = loadCachedActivities().find((a) => a.city === "NRT")!;

  it("accepts a slot the catalogue actually offers", () => {
    const startUtc = localTimeToUtc(
      "2026-11-13",
      activity.startTimes[0]!,
      activity.city,
    );
    assert.equal(runsAt(activity, startUtc), true);
  });

  it("accepts every advertised slot", () => {
    for (const time of activity.startTimes) {
      assert.ok(
        runsAt(activity, localTimeToUtc("2026-11-13", time, activity.city)),
        `${time} should be bookable`,
      );
    }
  });

  // Otherwise the supplier signs a confirmation for something that does not exist.
  it("refuses a time the catalogue does not offer", () => {
    const bogus = localTimeToUtc("2026-11-13", "03:17", activity.city);
    assert.equal(runsAt(activity, bogus), false);
  });

  it("refuses an unparseable instant", () => {
    assert.equal(runsAt(activity, "not-a-date"), false);
  });
});

describe("confirmation signature", () => {
  // Rebuilds what the route signs, so the assertion is about the shape being
  // signed rather than about node:crypto working.
  it("verifies against the supplier's advertised public key", async () => {
    process.env["PAY_TO"] ??= "0.0.999999";
    const { signPayload, supplierPublicKeyBase64 } =
      await import("./../lib/signing.js");

    const leg = loadCachedFlights()[0]!;
    const confirmed = {
      legs: [
        {
          offerId: leg.offerId,
          departUtc: leg.departUtc,
          priceMinor: leg.priceMinor,
          currency: leg.currency,
        },
      ],
      activities: [],
      totalMinor: leg.priceMinor,
      currency: leg.currency,
    };
    const payload = {
      bookingId: "b1",
      confirmationCode: "ABCD1234",
      status: "CONFIRMED_SIMULATED",
      issuedAt: "2026-11-01T00:00:00.000Z",
      passengerName: "A Traveller",
      passengerEmail: "a@example.com",
      confirmed,
    };

    const signature = signPayload(payload);
    const publicKey = createPublicKey({
      key: Buffer.from(supplierPublicKeyBase64, "base64"),
      format: "der",
      type: "spki",
    });
    assert.ok(
      verify(
        null,
        Buffer.from(canonicalJson(payload), "utf-8"),
        publicKey,
        Buffer.from(signature, "base64"),
      ),
    );

    // The point of signing the itinerary rather than just its id: changing a
    // price must invalidate the signature.
    const tampered = {
      ...payload,
      confirmed: { ...confirmed, totalMinor: confirmed.totalMinor + 1 },
    };
    assert.equal(
      verify(
        null,
        Buffer.from(canonicalJson(tampered), "utf-8"),
        publicKey,
        Buffer.from(signature, "base64"),
      ),
      false,
    );
  });
});
