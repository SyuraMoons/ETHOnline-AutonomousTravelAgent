import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ItineraryDay, TripDossier } from "./dossier.js";
import { FlightOption } from "./flights.js";
import { Mandate, MandateTerms } from "./mandate.js";

/**
 * The four schemas that were genuinely untested rather than exercised through a
 * parent: the autonomous run's final report, the free-text day plan inside it,
 * the flight pair it chose, and the spending terms a user sets before granting
 * the on-chain allowance.
 *
 * What each one guards is different. The dossier is what "Book everything"
 * spends an approval against; the day plan is the one part of a trip report
 * nobody paid for and nobody can book; MandateTerms is what a wallet signature
 * is about to authorize.
 */

const AT = "2026-11-12T06:00:00.000Z";

const leg = {
  offerId: "flt_001",
  origin: "SIN",
  destination: "NRT",
  departUtc: AT,
  arriveUtc: "2026-11-12T13:30:00.000Z",
  airline: "SQ",
  flightNumber: "SQ12",
  priceMinor: 48_900,
  currency: "USD",
  seatsAvailable: 4,
  fromInventory: true,
};

const option = {
  optionId: "opt_1",
  itineraryHash: "0xabc",
  legs: [leg],
  perPaxMinor: 48_900,
  totalMinor: 48_900,
  currency: "USD",
  cabin: "economy",
  stops: 0,
  durationMinutes: 450,
  badges: ["cheapest"],
};

const day = {
  dayNumber: 1,
  date: "2026-11-12",
  title: "Arrive in Tokyo",
  notes: "Land mid-afternoon, stay near the station.",
  suggestions: ["Walk Yanaka Ginza at dusk"],
  source: "agent_suggestion",
};

const dossier = {
  dossierId: "dos_1",
  createdAt: AT,
  trip: {
    origin: "SIN",
    destination: "NRT",
    departDate: "2026-11-12",
    paxCount: 1,
    cabin: "economy",
  },
  option,
  itineraryHash: "0xabc",
  days: [day],
  fareTotalMinor: 48_900,
  currency: "USD",
  bookable: true,
  searchSpend: [
    {
      amountHbar: "0.8800",
      transaction: "0.0.10374824@1789204957.595784107",
      hashscanUrl: "https://hashscan.io/testnet/transaction/x",
    },
  ],
};

describe("FlightOption — the pair an approval is about to cover", () => {
  it("accepts a resolved option", () => {
    assert.ok(FlightOption.safeParse(option).success);
  });

  it("refuses an option with no legs", () => {
    // An option is a thing you can book. Zero legs is not a cheaper trip, it is
    // a trip that does not exist, and it would hash and total perfectly happily.
    assert.equal(
      FlightOption.safeParse({ ...option, legs: [] }).success,
      false,
    );
  });

  it("refuses a badge the UI has no ribbon for", () => {
    assert.equal(
      FlightOption.safeParse({ ...option, badges: ["greenest"] }).success,
      false,
    );
  });

  it("refuses a fractional price", () => {
    // Minor units are integers. A float here is a rounding argument on a
    // signed confirmation later.
    assert.equal(
      FlightOption.safeParse({ ...option, totalMinor: 48_900.5 }).success,
      false,
    );
  });
});

describe("ItineraryDay — the part nobody paid for", () => {
  it("accepts a day the agent wrote", () => {
    assert.ok(ItineraryDay.safeParse(day).success);
  });

  it("refuses any source but agent_suggestion", () => {
    // The literal is the whole point: it is what lets the UI narrow on
    // "this is free text, not a bookable item" instead of trusting a flag
    // that could drift to true for something nobody can actually sell.
    assert.equal(
      ItineraryDay.safeParse({ ...day, source: "supplier" }).success,
      false,
    );
  });

  it("refuses a day zero", () => {
    assert.equal(ItineraryDay.safeParse({ ...day, dayNumber: 0 }).success, false);
  });
});

describe("TripDossier — what Book everything spends an approval against", () => {
  it("accepts a complete dossier", () => {
    assert.ok(TripDossier.safeParse(dossier).success);
  });

  it("requires bookable to be stated", () => {
    // Absent must not read as bookable. Only offers in the supplier's own
    // inventory settle at POST /v1/booking; a synthetic fallback row would
    // otherwise fail at booking time rather than before the button is shown.
    const { bookable: _omitted, ...withoutFlag } = dossier;
    assert.equal(TripDossier.safeParse(withoutFlag).success, false);
  });

  it("requires the search spend to be itemised, even when empty", () => {
    assert.ok(TripDossier.safeParse({ ...dossier, searchSpend: [] }).success);
    const { searchSpend: _omitted, ...withoutSpend } = dossier;
    assert.equal(TripDossier.safeParse(withoutSpend).success, false);
  });

  it("refuses a spend entry that cannot be checked on HashScan", () => {
    // An amount with no transaction id is an unverifiable claim that money moved.
    const spend = [{ amountHbar: "0.8800" }];
    assert.equal(TripDossier.safeParse({ ...dossier, searchSpend: spend }).success, false);
  });

  it("refuses zero passengers", () => {
    const trip = { ...dossier.trip, paxCount: 0 };
    assert.equal(TripDossier.safeParse({ ...dossier, trip }).success, false);
  });
});

describe("MandateTerms — what the wallet signature authorizes", () => {
  const terms = {
    payerAccountId: "0.0.10286792",
    totalCeilingHbar: 5,
    perTxCeilingHbar: 1,
    ttlMinutes: 60,
  };

  it("accepts the terms the budget card sets", () => {
    assert.ok(MandateTerms.safeParse(terms).success);
  });

  it("requires a payer account", () => {
    // Unlike Mandate, where it is optional for legacy treasury mode, terms
    // always name whose HBAR is about to be spent — there is no allowance
    // without an owner.
    const { payerAccountId: _omitted, ...anonymous } = terms;
    assert.equal(MandateTerms.safeParse(anonymous).success, false);
  });

  it("refuses a zero or negative ceiling", () => {
    assert.equal(MandateTerms.safeParse({ ...terms, totalCeilingHbar: 0 }).success, false);
    assert.equal(MandateTerms.safeParse({ ...terms, perTxCeilingHbar: -1 }).success, false);
  });

  it("refuses a mandate that expires the moment it is granted", () => {
    assert.equal(MandateTerms.safeParse({ ...terms, ttlMinutes: 0 }).success, false);
  });

  it("lets a Mandate omit payerAccountId for treasury mode", () => {
    const mandate = {
      mandateId: "m_1",
      totalCeilingHbar: 5,
      perTxCeilingHbar: 1,
      spentHbar: 0,
      remainingHbar: 5,
      expiresAt: AT,
      status: "active",
    };
    assert.ok(Mandate.safeParse(mandate).success);
  });

  it("refuses a mandate status nothing branches on", () => {
    const mandate = {
      mandateId: "m_1",
      totalCeilingHbar: 5,
      perTxCeilingHbar: 1,
      spentHbar: 0,
      remainingHbar: 5,
      expiresAt: AT,
      status: "paused",
    };
    assert.equal(Mandate.safeParse(mandate).success, false);
  });
});
