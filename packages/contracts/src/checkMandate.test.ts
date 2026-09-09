import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkMandate } from "./checkMandate.js";
import type { Mandate } from "./mandate.js";

const NOW = new Date("2026-09-10T12:00:00.000Z");

const mandate = (over: Partial<Mandate> = {}): Mandate => ({
  mandateId: "mnd_demo",
  totalCeilingHbar: 10,
  perTxCeilingHbar: 2.5,
  spentHbar: 0,
  remainingHbar: 10,
  expiresAt: "2026-09-11T12:00:00.000Z",
  nullifierHash: "0xnullifier",
  status: "active",
  ...over,
});

describe("checkMandate — allowing", () => {
  it("allows a spend inside every ceiling", () => {
    const decision = checkMandate({
      mandate: mandate(),
      amountHbar: 1,
      now: NOW,
    });
    assert.deepEqual(decision, { allowed: true, remainingAfterHbar: 9 });
  });

  it("allows a spend exactly at the per-tx ceiling", () => {
    const decision = checkMandate({
      mandate: mandate(),
      amountHbar: 2.5,
      now: NOW,
    });
    assert.equal(decision.allowed, true);
  });

  it("allows a spend that exactly exhausts the total ceiling", () => {
    const decision = checkMandate({
      mandate: mandate({ spentHbar: 8, perTxCeilingHbar: 2 }),
      amountHbar: 2,
      now: NOW,
    });
    assert.deepEqual(decision, { allowed: true, remainingAfterHbar: 0 });
  });

  it("allows the smallest representable spend of one tinybar", () => {
    assert.equal(
      checkMandate({ mandate: mandate(), amountHbar: 0.00000001, now: NOW })
        .allowed,
      true,
    );
  });

  // The reason this function converts to integer tinybars. In IEEE-754,
  // 0.1 + 0.2 === 0.30000000000000004, so naive float math refuses a spend
  // that is precisely within budget.
  it("does not refuse a within-budget spend to floating-point error", () => {
    const decision = checkMandate({
      mandate: mandate({
        totalCeilingHbar: 0.3,
        perTxCeilingHbar: 0.3,
        spentHbar: 0.1,
      }),
      amountHbar: 0.2,
      now: NOW,
    });
    assert.deepEqual(decision, { allowed: true, remainingAfterHbar: 0 });
  });

  it("does not allow an over-budget spend to floating-point error", () => {
    const decision = checkMandate({
      mandate: mandate({
        totalCeilingHbar: 0.3,
        perTxCeilingHbar: 0.3,
        spentHbar: 0.1,
      }),
      amountHbar: 0.20000001,
      now: NOW,
    });
    assert.deepEqual(decision, {
      allowed: false,
      reason: "total_ceiling_exceeded",
    });
  });

  it("stays exact across many small accumulated spends", () => {
    // 0.1 x 10 drifts above 1.0 in float arithmetic; in tinybars it lands exactly.
    let spent = 0;
    for (let i = 0; i < 9; i += 1) {
      const decision = checkMandate({
        mandate: mandate({
          totalCeilingHbar: 1,
          perTxCeilingHbar: 1,
          spentHbar: spent,
        }),
        amountHbar: 0.1,
        now: NOW,
      });
      assert.equal(decision.allowed, true, `spend ${i + 1} should be allowed`);
      spent += 0.1;
    }
    const last = checkMandate({
      mandate: mandate({
        totalCeilingHbar: 1,
        perTxCeilingHbar: 1,
        spentHbar: spent,
      }),
      amountHbar: 0.1,
      now: NOW,
    });
    assert.deepEqual(last, { allowed: true, remainingAfterHbar: 0 });
  });
});

describe("checkMandate — refusing", () => {
  it("refuses a spend over the per-tx ceiling", () => {
    const decision = checkMandate({
      mandate: mandate(),
      amountHbar: 2.50000001,
      now: NOW,
    });
    assert.deepEqual(decision, {
      allowed: false,
      reason: "per_tx_ceiling_exceeded",
    });
  });

  it("refuses a spend that would cross the total ceiling", () => {
    const decision = checkMandate({
      mandate: mandate({ spentHbar: 9.5 }),
      amountHbar: 1,
      now: NOW,
    });
    assert.deepEqual(decision, {
      allowed: false,
      reason: "total_ceiling_exceeded",
    });
  });

  it("refuses once the expiry instant is reached", () => {
    const decision = checkMandate({
      mandate: mandate({ expiresAt: NOW.toISOString() }),
      amountHbar: 1,
      now: NOW,
    });
    assert.deepEqual(decision, { allowed: false, reason: "mandate_expired" });
  });

  it("allows one millisecond before expiry", () => {
    const decision = checkMandate({
      mandate: mandate({
        expiresAt: new Date(NOW.getTime() + 1).toISOString(),
      }),
      amountHbar: 1,
      now: NOW,
    });
    assert.equal(decision.allowed, true);
  });

  it("refuses an exhausted mandate as total_ceiling_exceeded", () => {
    const decision = checkMandate({
      mandate: mandate({ status: "exhausted" }),
      amountHbar: 1,
      now: NOW,
    });
    assert.deepEqual(decision, {
      allowed: false,
      reason: "total_ceiling_exceeded",
    });
  });

  it("refuses an expired-status mandate even when the clock says otherwise", () => {
    const decision = checkMandate({
      mandate: mandate({ status: "expired" }),
      amountHbar: 1,
      now: NOW,
    });
    assert.deepEqual(decision, { allowed: false, reason: "mandate_expired" });
  });

  it("refuses a revoked mandate", () => {
    const decision = checkMandate({
      mandate: mandate({ status: "revoked" }),
      amountHbar: 1,
      now: NOW,
    });
    assert.deepEqual(decision, { allowed: false, reason: "mandate_expired" });
  });

  // Status is checked before the clock, and expiry before the ceilings, so the
  // reason names the strongest objection rather than the first arithmetic failure.
  it("reports expiry ahead of a ceiling breach when both apply", () => {
    const decision = checkMandate({
      mandate: mandate({
        expiresAt: "2026-09-09T12:00:00.000Z",
        spentHbar: 10,
      }),
      amountHbar: 99,
      now: NOW,
    });
    assert.deepEqual(decision, { allowed: false, reason: "mandate_expired" });
  });

  it("reports the per-tx breach ahead of the total breach when both apply", () => {
    const decision = checkMandate({
      mandate: mandate({ spentHbar: 9.9 }),
      amountHbar: 5,
      now: NOW,
    });
    assert.deepEqual(decision, {
      allowed: false,
      reason: "per_tx_ceiling_exceeded",
    });
  });

  it("ignores a stale remainingHbar and trusts spentHbar", () => {
    // remainingHbar lies that budget is left; spentHbar says it is gone.
    const decision = checkMandate({
      mandate: mandate({ spentHbar: 10, remainingHbar: 10 }),
      amountHbar: 1,
      now: NOW,
    });
    assert.deepEqual(decision, {
      allowed: false,
      reason: "total_ceiling_exceeded",
    });
  });
});

describe("checkMandate — invalid input is loud, not a refusal", () => {
  it("throws on a zero amount", () => {
    assert.throws(
      () => checkMandate({ mandate: mandate(), amountHbar: 0, now: NOW }),
      RangeError,
    );
  });

  it("throws on a negative amount", () => {
    assert.throws(
      () => checkMandate({ mandate: mandate(), amountHbar: -1, now: NOW }),
      RangeError,
    );
  });

  it("throws on a non-finite amount", () => {
    assert.throws(
      () => checkMandate({ mandate: mandate(), amountHbar: NaN, now: NOW }),
      TypeError,
    );
    assert.throws(
      () =>
        checkMandate({ mandate: mandate(), amountHbar: Infinity, now: NOW }),
      // Infinity is not a magnitude problem but a type-of-value problem, so it
      // is caught by the finite check and reported as TypeError.
      TypeError,
    );
  });

  it("throws on an amount beyond the safe conversion range", () => {
    assert.throws(
      () => checkMandate({ mandate: mandate(), amountHbar: 1e9, now: NOW }),
      RangeError,
    );
  });

  it("throws on an unparseable expiry", () => {
    assert.throws(
      () =>
        checkMandate({
          mandate: mandate({ expiresAt: "not-a-date" }),
          amountHbar: 1,
          now: NOW,
        }),
      TypeError,
    );
  });

  it("throws on a negative spentHbar", () => {
    assert.throws(
      () =>
        checkMandate({
          mandate: mandate({ spentHbar: -1 }),
          amountHbar: 1,
          now: NOW,
        }),
      RangeError,
    );
  });
});
