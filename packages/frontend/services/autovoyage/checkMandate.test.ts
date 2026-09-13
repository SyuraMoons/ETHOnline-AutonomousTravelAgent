import { checkMandate } from "./checkMandate.js";
import type { Mandate } from "@sh/contracts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const NOW = new Date("2026-09-12T12:00:00.000Z");

const mandate = (over: Partial<Mandate> = {}): Mandate => ({
  mandateId: "mnd_demo",
  totalCeilingHbar: 10,
  perTxCeilingHbar: 2.5,
  spentHbar: 0,
  remainingHbar: 10,
  expiresAt: "2026-09-13T12:00:00.000Z",
  status: "active",
  payerAccountId: "0.0.1234",
  ...over,
});

describe("checkMandate — allowing", () => {
  it("allows a spend inside every ceiling", () => {
    assert.deepEqual(checkMandate(mandate(), 1, NOW), { ok: true });
  });

  it("allows a spend exactly at the per-tx ceiling", () => {
    assert.equal(checkMandate(mandate(), 2.5, NOW).ok, true);
  });

  it("allows a spend that exactly exhausts the total ceiling", () => {
    assert.deepEqual(checkMandate(mandate({ spentHbar: 8, perTxCeilingHbar: 2 }), 2, NOW), { ok: true });
  });

  it("allows the smallest representable spend of one tinybar", () => {
    assert.equal(checkMandate(mandate(), 0.00000001, NOW).ok, true);
  });

  // The reason this converts to integer tinybars. 0.1 + 0.2 === 0.30000000000000004,
  // so naive float math refuses a spend that is precisely within budget.
  it("does not refuse a within-budget spend to floating-point error", () => {
    const m = mandate({ totalCeilingHbar: 0.3, perTxCeilingHbar: 0.3, spentHbar: 0.1 });
    assert.deepEqual(checkMandate(m, 0.2, NOW), { ok: true });
  });

  it("does not allow an over-budget spend to floating-point error", () => {
    const m = mandate({ totalCeilingHbar: 0.3, perTxCeilingHbar: 0.3, spentHbar: 0.1 });
    assert.deepEqual(checkMandate(m, 0.20000001, NOW), { ok: false, reason: "total_ceiling_exceeded" });
  });

  // Mirrors reserveSpend(), which sums reservations as floats before calling in. Rounding at
  // this boundary must absorb that drift rather than inheriting it.
  it("absorbs drift from a float-summed projected spend", () => {
    const reservations = [0.45, 0.32, 0.18, 0.27, 0.41, 0.13, 0.36, 0.22, 0.29, 0.37];
    const reserved = reservations.reduce((sum, r) => sum + r, 0);
    const ceiling = Math.round(reservations.reduce((s, r) => s + Math.round(r * 1e8), 0)) / 1e8;
    const m = mandate({ totalCeilingHbar: ceiling, perTxCeilingHbar: ceiling, spentHbar: reserved - 0.37 });
    assert.deepEqual(checkMandate(m, 0.37, NOW), { ok: true });
  });
});

describe("checkMandate — refusing", () => {
  it("refuses a spend over the per-tx ceiling", () => {
    assert.deepEqual(checkMandate(mandate(), 2.50000001, NOW), { ok: false, reason: "per_tx_ceiling_exceeded" });
  });

  it("refuses a spend that would cross the total ceiling", () => {
    assert.deepEqual(checkMandate(mandate({ spentHbar: 9.5 }), 1, NOW), {
      ok: false,
      reason: "total_ceiling_exceeded",
    });
  });

  it("refuses once the expiry instant is reached", () => {
    const decision = checkMandate(mandate({ expiresAt: NOW.toISOString() }), 1, NOW);
    assert.deepEqual(decision, { ok: false, reason: "mandate_expired", detail: "ttl_expired" });
  });

  it("allows one millisecond before expiry", () => {
    const m = mandate({ expiresAt: new Date(NOW.getTime() + 1).toISOString() });
    assert.equal(checkMandate(m, 1, NOW).ok, true);
  });

  it("reports an exhausted mandate with its detail", () => {
    assert.deepEqual(checkMandate(mandate({ status: "exhausted" }), 1, NOW), {
      ok: false,
      reason: "mandate_expired",
      detail: "exhausted",
    });
  });

  it("reports a revoked mandate with its detail", () => {
    assert.deepEqual(checkMandate(mandate({ status: "revoked" }), 1, NOW), {
      ok: false,
      reason: "mandate_expired",
      detail: "revoked",
    });
  });

  it("reports the per-tx breach ahead of the total breach when both apply", () => {
    assert.deepEqual(checkMandate(mandate({ spentHbar: 9.9 }), 5, NOW), {
      ok: false,
      reason: "per_tx_ceiling_exceeded",
    });
  });

  it("ignores a stale remainingHbar and trusts spentHbar", () => {
    // remainingHbar lies that budget is left; spentHbar says it is gone.
    assert.deepEqual(checkMandate(mandate({ spentHbar: 10, remainingHbar: 10 }), 1, NOW), {
      ok: false,
      reason: "total_ceiling_exceeded",
    });
  });
});

describe("checkMandate — invalid input is loud, not an approval", () => {
  // Every comparison against NaN is false, so without this guard a NaN amount falls through
  // all four ceilings and is authorised.
  it("throws on NaN rather than authorising it", () => {
    assert.throws(() => checkMandate(mandate(), NaN, NOW), TypeError);
  });

  it("throws on Infinity", () => {
    assert.throws(() => checkMandate(mandate(), Infinity, NOW), TypeError);
  });

  it("throws on a negative amount", () => {
    // "Spending" a negative amount would otherwise increase remaining headroom.
    assert.throws(() => checkMandate(mandate(), -5, NOW), RangeError);
  });

  it("throws on a zero amount", () => {
    assert.throws(() => checkMandate(mandate(), 0, NOW), RangeError);
  });

  it("throws on an amount beyond the safe conversion range", () => {
    assert.throws(() => checkMandate(mandate(), 1e9, NOW), RangeError);
  });

  it("throws on an unparseable expiry", () => {
    assert.throws(() => checkMandate(mandate({ expiresAt: "not-a-date" }), 1, NOW), TypeError);
  });

  it("throws on a negative spentHbar", () => {
    assert.throws(() => checkMandate(mandate({ spentHbar: -1 }), 1, NOW), RangeError);
  });
});
