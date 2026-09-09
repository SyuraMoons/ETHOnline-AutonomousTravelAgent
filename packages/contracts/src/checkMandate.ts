import type { Mandate } from "./mandate.js";
import type { RefusalReason } from "./refusal.js";

// Per AGENTS.md this is the only code path where a bug loses money live, so it
// is deliberately boring: pure, synchronous, no I/O, no clock of its own, and
// all arithmetic in integer tinybars.
//
// WHY TINYBARS: the Mandate schema carries HBAR as `number` (float). Comparing
// floats loses money — 0.1 + 0.2 > 0.3 is true in IEEE-754, which would refuse
// a spend that is actually within budget, and the mirror-image case overspends.
// Every amount is therefore converted to integer tinybars at the boundary here
// and never compared as a float. See the schema note at the bottom of this file.

const TINYBAR_PER_HBAR = 100_000_000n;

// Largest HBAR value that survives `hbar * 1e8` inside IEEE-754's exact integer
// range (2^53-1). ~90M HBAR — far above any mandate, but a silently wrong
// conversion above it is exactly the failure this function exists to prevent.
const MAX_SAFE_HBAR = Number.MAX_SAFE_INTEGER / 1e8;

// Exact conversion for values inside the safe range. Rounds to the nearest
// tinybar, which is the smallest unit the ledger represents — sub-tinybar
// precision does not exist and cannot be lost.
function toTinybars(hbar: number, label: string): bigint {
  if (!Number.isFinite(hbar)) {
    throw new TypeError(
      `checkMandate: ${label} must be a finite number, got ${hbar}`,
    );
  }
  if (hbar < 0) {
    throw new RangeError(
      `checkMandate: ${label} must not be negative, got ${hbar}`,
    );
  }
  if (hbar > MAX_SAFE_HBAR) {
    throw new RangeError(
      `checkMandate: ${label} exceeds the safe conversion range (${MAX_SAFE_HBAR} HBAR)`,
    );
  }
  return BigInt(Math.round(hbar * Number(TINYBAR_PER_HBAR)));
}

function toHbar(tinybars: bigint): number {
  return Number(tinybars) / Number(TINYBAR_PER_HBAR);
}

export type MandateDecision =
  | { allowed: true; remainingAfterHbar: number }
  | { allowed: false; reason: RefusalReason };

export interface CheckMandateInput {
  mandate: Mandate;
  // The spend being proposed, in HBAR. This is the x402 fee about to be paid to
  // a supplier — not the flight fare, which is denominated in fiat minor units.
  amountHbar: number;
  // Injected rather than read from the clock so this stays pure and testable.
  now: Date;
}

/**
 * Decides whether one proposed x402 spend is permitted by a mandate.
 *
 * Checks run most-fundamental first, so the reason returned describes the
 * strongest objection: a mandate that is both expired and over-ceiling refuses
 * as `mandate_expired`, because an expired mandate authorises nothing at all.
 *
 *   1. status is not `active`
 *   2. wall-clock expiry has passed
 *   3. this single spend exceeds the per-transaction ceiling
 *   4. this spend would push cumulative spend past the total ceiling
 *
 * Throws (rather than refusing) on structurally invalid input — a negative or
 * non-finite amount is a caller bug, not a policy decision, and must be loud.
 */
export function checkMandate({
  mandate,
  amountHbar,
  now,
}: CheckMandateInput): MandateDecision {
  const amount = toTinybars(amountHbar, "amountHbar");
  if (amount === 0n) {
    throw new RangeError("checkMandate: amountHbar must be greater than zero");
  }

  if (mandate.status !== "active") {
    // NOTE: the closed refusal set in AGENTS.md has no `mandate_revoked`, so a
    // revoked mandate reports as `mandate_expired` — both mean "this mandate no
    // longer authorises anything". Worth adding a dedicated code before launch.
    return {
      allowed: false,
      reason:
        mandate.status === "exhausted"
          ? "total_ceiling_exceeded"
          : "mandate_expired",
    };
  }

  const expiresAt = new Date(mandate.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    throw new TypeError(
      `checkMandate: mandate.expiresAt is not a valid date: ${mandate.expiresAt}`,
    );
  }
  // Expiry is exclusive: a mandate is dead at its expiry instant, not after it.
  if (now.getTime() >= expiresAt.getTime()) {
    return { allowed: false, reason: "mandate_expired" };
  }

  const perTxCeiling = toTinybars(
    mandate.perTxCeilingHbar,
    "mandate.perTxCeilingHbar",
  );
  if (amount > perTxCeiling) {
    return { allowed: false, reason: "per_tx_ceiling_exceeded" };
  }

  // `spentHbar` is authoritative; `remainingHbar` is display-only and is NOT
  // trusted here — two fields describing one quantity will drift, and the one
  // derived from the ledger of past spends is the one that cannot silently lie.
  const totalCeiling = toTinybars(
    mandate.totalCeilingHbar,
    "mandate.totalCeilingHbar",
  );
  const spent = toTinybars(mandate.spentHbar, "mandate.spentHbar");
  const remainingAfter = totalCeiling - spent - amount;
  if (remainingAfter < 0n) {
    return { allowed: false, reason: "total_ceiling_exceeded" };
  }

  return { allowed: true, remainingAfterHbar: toHbar(remainingAfter) };
}
