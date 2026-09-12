import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertNoPan, BookingRequest, PaymentInstrument } from "./booking.js";

/**
 * The point of these is that this stays a simulation.
 *
 * HBAR buys data; the fare goes to a card. That card must never be a real one,
 * and the guards below are what make wiring this to a live processor a
 * deliberate act rather than an accident.
 */

const CARD = {
  method: "card" as const,
  token: "tok_test_4242abcd",
  brand: "visa" as const,
  last4: "4242",
  holderName: "A Traveller",
};

describe("PaymentInstrument", () => {
  it("accepts a test token", () => {
    assert.ok(PaymentInstrument.safeParse(CARD).success);
  });

  // 4242 4242 4242 4242 is the canonical test PAN and still a valid card number
  // shape. Accepting it here would mean the field can hold a real one.
  it("refuses a card number in the token field", () => {
    assert.equal(
      PaymentInstrument.safeParse({ ...CARD, token: "4242424242424242" })
        .success,
      false,
    );
  });

  it("refuses a token that is not a test token", () => {
    assert.equal(
      PaymentInstrument.safeParse({ ...CARD, token: "tok_live_abcd1234" })
        .success,
      false,
    );
  });

  it("holds only four digits for display", () => {
    assert.equal(
      PaymentInstrument.safeParse({ ...CARD, last4: "424242424242" }).success,
      false,
    );
    assert.equal(
      PaymentInstrument.safeParse({ ...CARD, last4: "42a2" }).success,
      false,
    );
  });

  it("refuses a payment method it cannot simulate", () => {
    assert.equal(
      PaymentInstrument.safeParse({ ...CARD, method: "sepa" }).success,
      false,
    );
  });
});

describe("assertNoPan", () => {
  // The schema constrains each field, but a number pasted into a free-text one
  // would otherwise reach a log line and a signed confirmation before anything
  // rejected it.
  it("refuses a Luhn-valid card number hidden in a name", () => {
    assert.throws(
      () => assertNoPan({ ...CARD, holderName: "4242424242424242" }),
      /looks like a real card number/,
    );
  });

  it("finds one however it is spaced or dashed", () => {
    for (const pan of [
      "4242 4242 4242 4242",
      "4242-4242-4242-4242",
      "4242,4242,4242,4242",
    ]) {
      assert.throws(
        () => assertNoPan({ note: pan }),
        /card number/,
        `missed ${pan}`,
      );
    }
  });

  it("finds one nested anywhere in the payload", () => {
    assert.throws(
      () => assertNoPan({ a: { b: { c: ["5555555555554444"] } } }),
      /card number/,
    );
  });

  it("catches the other brands' test numbers too", () => {
    for (const pan of [
      "5555555555554444",
      "378282246310005",
      "6011111111111117",
    ]) {
      assert.throws(() => assertNoPan({ pan }), /card number/, `missed ${pan}`);
    }
  });

  // Luhn is what separates a card number from any other run of digits. Without
  // it, a booking id or a timestamp would trip the guard and block real traffic.
  it("lets through digits that are not card numbers", () => {
    assert.doesNotThrow(() => assertNoPan({ bookingId: "1234567890123456" }));
    assert.doesNotThrow(() =>
      assertNoPan({ ts: "2026-11-12T06:00:00.000Z", total: 34000 }),
    );
    assert.doesNotThrow(() => assertNoPan(CARD));
  });

  it("is safe on empty and absent input", () => {
    assert.doesNotThrow(() => assertNoPan(undefined));
    assert.doesNotThrow(() => assertNoPan(null));
    assert.doesNotThrow(() => assertNoPan({}));
  });
});

describe("BookingRequest", () => {
  const base = {
    legs: [{ offerId: "flt_001" }],
    passengerName: "A Traveller",
    passengerEmail: "a@example.com",
  };

  it("requires a payment instrument", () => {
    // An itinerary nobody pays for is not a booking.
    assert.equal(BookingRequest.safeParse(base).success, false);
    assert.ok(BookingRequest.safeParse({ ...base, payment: CARD }).success);
  });

  it("still carries no prices", () => {
    // The supplier resolves every price from its own inventory; a client-sent
    // one is a client-sent claim, and it would end up on a signed confirmation.
    const parsed = BookingRequest.parse({
      ...base,
      payment: CARD,
      legs: [{ offerId: "flt_001", priceMinor: 1 }],
    });
    assert.equal("priceMinor" in parsed.legs[0]!, false);
  });
});
