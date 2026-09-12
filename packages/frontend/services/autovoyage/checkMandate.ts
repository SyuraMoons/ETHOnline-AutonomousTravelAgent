import type { Mandate, RefusalReason } from "@sh/contracts";

/**
 * The one pure, synchronous, no-I/O function in the mandate engine — split into its own module
 * (no `server-only` marker) so it stays importable from a plain Node/tsx script with no
 * database and no network. mandate.ts (Postgres-backed, `server-only`) re-exports this for its
 * existing callers; scripts/allowance-refusals.ts imports it directly.
 *
 * checkMandate() is the only code path where a bug loses money live — keep it pure so it stays
 * trivially testable.
 */

/**
 * Internal-only refinement of RefusalReason — never sent as the protocol-level `reason`
 * (that stays "mandate_expired" for all four cases below, per the closed RefusalReason set).
 * Callers use `detail` only to pick more accurate user-facing copy: "not found" (the store
 * never heard of this mandateId) reads very differently from a genuine TTL expiry.
 */
export type MandateFailureDetail = "not_found" | "ttl_expired" | "revoked" | "exhausted";

export function checkMandate(
  mandate: Mandate,
  amountHbar: number,
  now: Date,
): { ok: true } | { ok: false; reason: RefusalReason; detail?: MandateFailureDetail } {
  if (new Date(mandate.expiresAt).getTime() <= now.getTime()) {
    return { ok: false, reason: "mandate_expired", detail: "ttl_expired" };
  }
  if (mandate.status !== "active") {
    return { ok: false, reason: "mandate_expired", detail: mandate.status === "exhausted" ? "exhausted" : "revoked" };
  }
  if (amountHbar > mandate.perTxCeilingHbar) {
    return { ok: false, reason: "per_tx_ceiling_exceeded" };
  }
  if (mandate.spentHbar + amountHbar > mandate.totalCeilingHbar) {
    return { ok: false, reason: "total_ceiling_exceeded" };
  }
  return { ok: true };
}
