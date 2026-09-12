/**
 * Verifies the refusal paths for autonomous spending — the cases where the agent must NOT pay.
 *
 * A payment path is only trustworthy if its brakes work, and these are the brakes:
 *
 *   1. per-tx ceiling   — mandate refuses, nothing is quoted-then-paid, no HBAR moves
 *   2. total ceiling    — mandate refuses once the session budget is used up
 *   3. reservation      — two concurrent legs cannot both claim the same headroom
 *   4. on-chain ceiling — even if the mandate is wrong, the allowance stops it at consensus
 *
 * 1-3 exercise checkMandate() directly, imported from its own module (services/autovoyage/
 * checkMandate.ts) that carries no `server-only` marker and no DB import — the rest of
 * services/autovoyage/mandate.ts is Postgres-backed and needs SUPABASE_URL/
 * SUPABASE_SERVICE_ROLE_KEY. reserveSpend()'s "projected spend" math is replicated locally
 * here rather than calling the real (now async, DB-backed) function, so this script keeps
 * running with no database and no network. 4 needs the live stack and a funded user.
 *
 *   npx tsx scripts/allowance-refusals.ts
 */
import { checkMandate } from "../services/autovoyage/checkMandate.js";
import type { Mandate } from "@sh/contracts";

let failures = 0;

function check(label: string, condition: boolean, detail = "") {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

function mandate(input: { totalCeilingHbar: number; perTxCeilingHbar: number; ttlMinutes: number }): Mandate {
  return {
    mandateId: crypto.randomUUID(),
    totalCeilingHbar: input.totalCeilingHbar,
    perTxCeilingHbar: input.perTxCeilingHbar,
    spentHbar: 0,
    remainingHbar: input.totalCeilingHbar,
    expiresAt: new Date(Date.now() + input.ttlMinutes * 60_000).toISOString(),
    status: "active",
    payerAccountId: "0.0.999",
  };
}

/** Mirrors reserveSpend()'s reservedFor()+checkMandate() combo against an in-memory reservation list. */
function reserve(
  m: Mandate,
  reservations: number[],
  amountHbar: number,
  now: Date,
): { ok: true } | { ok: false; reason: string } {
  const reserved = reservations.reduce((sum, r) => sum + r, 0);
  const projected: Mandate = { ...m, spentHbar: m.spentHbar + reserved };
  const check = checkMandate(projected, amountHbar, now);
  if (!check.ok) return { ok: false, reason: check.reason };
  reservations.push(amountHbar);
  return { ok: true };
}

function main() {
  const now = new Date();

  // --- 1. per-tx ceiling ----------------------------------------------------
  const m1 = mandate({ totalCeilingHbar: 5, perTxCeilingHbar: 0.05, ttlMinutes: 60 });
  const overPerTx = checkMandate(m1, 0.1, now);
  check(
    "per-tx ceiling refuses an over-priced search",
    !overPerTx.ok && overPerTx.reason === "per_tx_ceiling_exceeded",
    !overPerTx.ok ? overPerTx.reason : "allowed",
  );

  // --- 2. total ceiling -----------------------------------------------------
  const m2 = mandate({ totalCeilingHbar: 0.25, perTxCeilingHbar: 1, ttlMinutes: 60 });
  const m2Reservations: number[] = [];
  const r1 = reserve(m2, m2Reservations, 0.1, now);
  const r2 = reserve(m2, m2Reservations, 0.1, now);
  check("first two searches fit the budget", r1.ok && r2.ok);
  // Settlement: fold reservations into spentHbar, same as commitSpend()'s increment.
  m2.spentHbar += 0.2;
  m2Reservations.length = 0;
  const r3 = reserve(m2, m2Reservations, 0.1, now);
  check(
    "total ceiling refuses once the session budget is spent",
    !r3.ok && r3.reason === "total_ceiling_exceeded",
    !r3.ok ? r3.reason : "allowed",
  );

  // --- 3. reservation prevents double-spending the same headroom ------------
  // This is the round-trip case: outbound and inbound legs quoted before either settles.
  const m3 = mandate({ totalCeilingHbar: 0.15, perTxCeilingHbar: 1, ttlMinutes: 60 });
  const m3Reservations: number[] = [];
  const legA = reserve(m3, m3Reservations, 0.1, now);
  const legB = reserve(m3, m3Reservations, 0.1, now);
  check(
    "concurrent legs cannot both claim the same headroom",
    legA.ok && !legB.ok,
    legB.ok ? "BOTH allowed — would overspend" : "second leg refused",
  );

  // A refused payment must give its headroom back.
  const m4 = mandate({ totalCeilingHbar: 0.1, perTxCeilingHbar: 1, ttlMinutes: 60 });
  const m4Reservations: number[] = [];
  const held = reserve(m4, m4Reservations, 0.1, now);
  if (held.ok) m4Reservations.length = 0; // releaseSpend() equivalent: drop the reservation
  const afterRelease = reserve(m4, m4Reservations, 0.1, now);
  check("a failed payment releases its headroom", afterRelease.ok, afterRelease.ok ? "" : afterRelease.reason);

  // --- expiry ---------------------------------------------------------------
  const m5 = mandate({ totalCeilingHbar: 5, perTxCeilingHbar: 1, ttlMinutes: 60 });
  const later = new Date(Date.now() + 61 * 60_000);
  const expired = checkMandate(m5, 0.1, later);
  check(
    "an expired mandate refuses",
    !expired.ok && expired.reason === "mandate_expired",
    !expired.ok ? expired.reason : "allowed",
  );

  console.log(failures === 0 ? "\nAll refusal paths hold." : `\n${failures} refusal check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
