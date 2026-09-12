import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ActionRefused,
  AuditEvent,
  AuditRefusalReason,
  DataPayment,
} from "./audit.js";
import {
  ConsentInitiateRequest,
  ConsentVerifyRequest,
  ConsentVerifyResponse,
} from "./consent.js";
import { ExecuteRequest, ExecuteResponse, ExecutedBooking } from "./dossier.js";
import { RefusalReason } from "./refusal.js";
import { AgentCard, X402Challenge } from "./x402.js";
import { PlanActivity, PlanStay } from "./plan.js";
import { StayOffer } from "./stay.js";
import { ActivityOffer } from "./activity.js";

/**
 * Coverage for the schemas that guard the claims this project makes: the public
 * audit trail, the closed refusal set, the consent gate, and the shapes that
 * cross a wire someone else reads.
 *
 * Most of these had no tests at all. They are not exotic — they are the ones
 * where being wrong is not a bug report but a false statement on a public topic.
 */

const AT = "2026-11-12T06:00:00.000Z";
const base = {
  eventId: "evt_1",
  planId: "plan_1",
  v: 1 as const,
  timestamp: AT,
};

describe("audit events — what gets written to a public topic", () => {
  it("accepts each of the four event types", () => {
    assert.ok(
      AuditEvent.safeParse({
        ...base,
        type: "DataPayment",
        amountHbar: 0.88,
        payTo: "0.0.1",
        txId: "t",
      }).success,
    );
    assert.ok(
      AuditEvent.safeParse({
        ...base,
        type: "HumanApproval",
        itineraryHash: "0xab",
        payerAccountId: "0.0.1",
      }).success,
    );
    assert.ok(
      AuditEvent.safeParse({
        ...base,
        type: "BookingExecuted",
        bookingId: "b",
        fareTotalMinor: 34000,
        currency: "USD",
      }).success,
    );
    assert.ok(
      AuditEvent.safeParse({
        ...base,
        type: "ActionRefused",
        reason: "total_ceiling_exceeded",
      }).success,
    );
  });

  it("refuses an event type nobody can interpret", () => {
    assert.equal(
      AuditEvent.safeParse({ ...base, type: "SomethingElse" }).success,
      false,
    );
  });

  // A topic message cannot be edited or withdrawn. An event missing the fields
  // that make it meaningful is a permanent, unreadable record.
  it("refuses a payment event with no amount or transaction", () => {
    assert.equal(
      DataPayment.safeParse({ ...base, type: "DataPayment", payTo: "0.0.1" })
        .success,
      false,
    );
    assert.equal(
      DataPayment.safeParse({
        ...base,
        type: "DataPayment",
        amountHbar: 0.88,
        payTo: "0.0.1",
      }).success,
      false,
    );
  });

  it("refuses a non-ISO timestamp", () => {
    const bad = {
      ...base,
      timestamp: "12 Nov 2026",
      type: "ActionRefused" as const,
      reason: "quote_expired" as const,
    };
    assert.equal(AuditEvent.safeParse(bad).success, false);
  });

  it("pins the schema version, so a future writer cannot be misread as v1", () => {
    assert.equal(
      AuditEvent.safeParse({
        ...base,
        v: 2,
        type: "ActionRefused",
        reason: "quote_expired",
      }).success,
      false,
    );
  });

  it("stays under the 1KB budget one topic message allows", () => {
    const event = {
      ...base,
      type: "BookingExecuted",
      bookingId: "b".repeat(36),
      fareTotalMinor: 34000,
      currency: "USD",
    };
    assert.ok(JSON.stringify(event).length < 1024);
  });

  it("is readable on HashScan without a decoder", () => {
    // Plaintext JSON with a type on the outside — someone scrolling a topic
    // should be able to tell what happened without our source code.
    const parsed = AuditEvent.parse({
      ...base,
      type: "ActionRefused",
      reason: "mandate_expired",
    });
    assert.equal(JSON.parse(JSON.stringify(parsed)).type, "ActionRefused");
  });
});

describe("refusal reasons — a closed set", () => {
  const CLOSED = [
    "per_tx_ceiling_exceeded",
    "total_ceiling_exceeded",
    "mandate_expired",
    "consent_missing",
    "consent_expired",
    "itinerary_mismatch",
    "quote_expired",
  ];

  it("is exactly the seven documented codes", () => {
    assert.deepEqual([...RefusalReason.options].sort(), [...CLOSED].sort());
  });

  // The set being closed is the point: a reader can enumerate every way the
  // agent is allowed to say no. An invented code breaks that promise.
  it("refuses a reason invented at the call site", () => {
    assert.equal(
      RefusalReason.safeParse("supplier_unreachable").success,
      false,
    );
    assert.equal(RefusalReason.safeParse("budget_exceeded").success, false);
  });

  // Operational failures are not protocol refusals, and the audit type widens
  // deliberately rather than by smuggling them into the closed set.
  it("lets the audit type carry operational failures the protocol set excludes", () => {
    assert.ok(AuditRefusalReason.safeParse("supplier_unreachable").success);
    assert.ok(AuditRefusalReason.safeParse("payment_rejected").success);
    assert.ok(AuditRefusalReason.safeParse("mandate_expired").success);
    assert.equal(AuditRefusalReason.safeParse("made_up").success, false);
  });

  it("only admits a closed-set reason into an ActionRefused", () => {
    assert.equal(
      ActionRefused.safeParse({
        ...base,
        type: "ActionRefused",
        reason: "nope",
      }).success,
      false,
    );
  });
});

describe("consent — the gate in front of spending", () => {
  it("binds a verification to one itinerary and one mandate", () => {
    // Without both, an approval could be replayed against a different trip or
    // a different budget than the one the human was shown.
    assert.equal(
      ConsentVerifyRequest.safeParse({ sessionId: "s", itineraryHash: "0xab" })
        .success,
      false,
    );
    assert.equal(
      ConsentVerifyRequest.safeParse({ sessionId: "s", mandateId: "m" })
        .success,
      false,
    );
    assert.ok(
      ConsentVerifyRequest.safeParse({
        sessionId: "s",
        itineraryHash: "0xab",
        mandateId: "m",
      }).success,
    );
  });

  it("requires an itinerary hash to open a session at all", () => {
    assert.equal(
      ConsentInitiateRequest.safeParse({ mandateId: "m" }).success,
      false,
    );
  });

  it("carries a token only alongside a positive verdict's shape", () => {
    assert.ok(
      ConsentVerifyResponse.safeParse({ verified: true, executionToken: "jwt" })
        .success,
    );
    assert.ok(
      ConsentVerifyResponse.safeParse({
        verified: false,
        reason: "consent_expired",
      }).success,
    );
  });

  it("refuses a rejection reason outside the closed set", () => {
    assert.equal(
      ConsentVerifyResponse.safeParse({
        verified: false,
        reason: "face_not_matched",
      }).success,
      false,
    );
  });
});

describe("execute — what a booking run reports back", () => {
  const booking = {
    offerId: "flt_1",
    bookingId: "b1",
    fareChargedMinor: 34000,
    currency: "USD",
    cardLast4: "4242",
  };

  it("reports the card charge, with on-chain fields optional", () => {
    // Booking settles against a card, so there is no transaction to link to.
    assert.ok(ExecutedBooking.safeParse(booking).success);
    assert.ok(
      ExecutedBooking.safeParse({
        ...booking,
        transaction: "0.0.1@1",
        hashscanUrl: "https://x",
      }).success,
    );
  });

  it("refuses a booking that does not say what was charged", () => {
    const { fareChargedMinor: _drop, ...withoutCharge } = booking;
    assert.equal(ExecutedBooking.safeParse(withoutCharge).success, false);
  });

  it("refuses a full card number where only four digits belong", () => {
    assert.equal(
      ExecutedBooking.safeParse({ ...booking, cardLast4: "4242424242424242" })
        .success,
      false,
    );
  });

  it("refuses a negative charge", () => {
    assert.equal(
      ExecutedBooking.safeParse({ ...booking, fareChargedMinor: -1 }).success,
      false,
    );
  });

  it("requires a token and a mandate to execute", () => {
    const req = {
      dossierId: "d",
      executionToken: "t",
      mandateId: "m",
      passenger: { name: "A", email: "a@b.com" },
    };
    assert.ok(ExecuteRequest.safeParse(req).success);
    assert.equal(
      ExecuteRequest.safeParse({ ...req, executionToken: undefined }).success,
      false,
    );
    assert.equal(
      ExecuteRequest.safeParse({
        ...req,
        passenger: { name: "A", email: "not-an-email" },
      }).success,
      false,
    );
  });

  it("carries a refusal reason from the closed set when it refuses", () => {
    assert.ok(
      ExecuteResponse.safeParse({
        status: "refused",
        bookings: [],
        totalHbarPaid: "0.0000",
        refusal: { reason: "itinerary_mismatch", message: "…" },
      }).success,
    );
    assert.equal(
      ExecuteResponse.safeParse({
        status: "refused",
        bookings: [],
        totalHbarPaid: "0.0000",
        refusal: { reason: "made_up", message: "…" },
      }).success,
      false,
    );
  });
});

describe("x402 wire shapes — read by clients we do not control", () => {
  it("accepts the card this supplier actually serves", () => {
    assert.ok(
      AgentCard.safeParse({
        agentId: "meridian-flight-data",
        name: "Meridian Flight Data",
        description: "…",
        payTo: "0.0.10492723",
        services: [
          {
            id: "stay-search",
            name: "Stay Search",
            description: "…",
            endpoint: "http://x/v1/stays/search",
            method: "GET",
            network: "hedera:testnet",
            pricing: "clamp(…)",
          },
        ],
      }).success,
    );
  });

  it("refuses a service method the scheme cannot express", () => {
    const svc = {
      id: "s",
      name: "S",
      description: "",
      endpoint: "http://x",
      method: "DELETE",
      network: "hedera:testnet",
    };
    assert.equal(
      AgentCard.safeParse({
        agentId: "a",
        name: "n",
        description: "",
        payTo: "0.0.1",
        services: [svc],
      }).success,
      false,
    );
  });

  it("keeps the challenge amount a string", () => {
    // Tinybar amounts exceed what a JSON number holds safely, and a rounded
    // amount is a wrong price.
    const opt = {
      scheme: "exact",
      network: "hedera:testnet",
      amount: "88000000",
      payTo: "0.0.1",
      asset: "0.0.0",
      maxTimeoutSeconds: 180,
    };
    const resource = { url: "http://localhost:4100/v1/stays/search" };
    assert.ok(
      X402Challenge.safeParse({ x402Version: 2, resource, accepts: [opt] })
        .success,
    );
    assert.equal(
      X402Challenge.safeParse({
        x402Version: 2,
        resource,
        accepts: [{ ...opt, amount: 88000000 }],
      }).success,
      false,
    );
  });

  it("requires the resource it is charging for", () => {
    // A challenge that does not name what is being bought is not something a
    // client can act on, or a human can audit afterwards.
    const opt = {
      scheme: "exact",
      network: "hedera:testnet",
      amount: "1",
      payTo: "0.0.1",
      asset: "0.0.0",
      maxTimeoutSeconds: 180,
    };
    assert.equal(
      X402Challenge.safeParse({ x402Version: 2, accepts: [opt] }).success,
      false,
    );
  });

  it("refuses a scheme it does not implement", () => {
    const opt = {
      scheme: "upto",
      network: "hedera:testnet",
      amount: "1",
      payTo: "0.0.1",
      asset: "0.0.0",
      maxTimeoutSeconds: 180,
    };
    const resource = { url: "http://localhost:4100/v1/stays/search" };
    assert.equal(
      X402Challenge.safeParse({ x402Version: 2, resource, accepts: [opt] })
        .success,
      false,
    );
  });
});

describe("hash inputs — the fields an approval is bound to", () => {
  it("requires an instant, not a date, for a stay", () => {
    // itineraryHash hashes these verbatim. A date where an instant belongs
    // would hash two different check-ins identically.
    const stay = {
      hotelId: "h",
      checkInUtc: AT,
      checkOutUtc: AT,
      priceMinor: 1,
      currency: "USD",
    };
    assert.ok(PlanStay.safeParse(stay).success);
    assert.equal(
      PlanStay.safeParse({ ...stay, checkInUtc: "2026-11-12" }).success,
      false,
    );
  });

  it("requires an instant for an activity slot", () => {
    const act = {
      activityId: "a",
      startUtc: AT,
      priceMinor: 1,
      currency: "USD",
    };
    assert.ok(PlanActivity.safeParse(act).success);
    assert.equal(
      PlanActivity.safeParse({ ...act, startUtc: "08:00" }).success,
      false,
    );
  });

  it("keeps offer prices as integer minor units", () => {
    // A fractional cent cannot be charged and would not survive a round trip.
    const offer = {
      hotelId: "h",
      checkInUtc: AT,
      checkOutUtc: AT,
      priceMinor: 15900,
      currency: "USD",
      name: "n",
      city: "NRT",
      area: "a",
      starRating: 4,
      roomType: "r",
      nights: 3,
      nightlyPriceMinor: 5300,
      refundable: true,
      amenities: [],
    };
    assert.ok(StayOffer.safeParse(offer).success);
    assert.equal(
      StayOffer.safeParse({ ...offer, priceMinor: 159.5 }).success,
      false,
    );
  });

  it("refuses a star rating outside one to five", () => {
    const offer = {
      hotelId: "h",
      checkInUtc: AT,
      checkOutUtc: AT,
      priceMinor: 1,
      currency: "USD",
      name: "n",
      city: "NRT",
      area: "a",
      starRating: 7,
      roomType: "r",
      nights: 1,
      nightlyPriceMinor: 1,
      refundable: true,
      amenities: [],
    };
    assert.equal(StayOffer.safeParse(offer).success, false);
  });

  it("refuses an activity pace the planner cannot filter on", () => {
    const offer = {
      activityId: "a",
      startUtc: AT,
      priceMinor: 1,
      currency: "USD",
      name: "n",
      summary: "s",
      city: "DPS",
      category: "nature",
      pace: "frantic",
      durationMinutes: 60,
      indoor: false,
    };
    assert.equal(ActivityOffer.safeParse(offer).success, false);
  });
});
