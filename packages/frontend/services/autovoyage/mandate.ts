import type { Mandate, RefusalReason } from "@sh/contracts";
import "server-only";
import { type MandateFailureDetail, checkMandate } from "~~/services/autovoyage/checkMandate";
import { db } from "~~/services/db/supabase";

export { checkMandate, type MandateFailureDetail };

/**
 * Postgres-backed spending mandate store (see supabase/schema.sql). Previously an in-memory
 * Map pinned to globalThis — that store was wiped by every server restart while the client
 * kept holding a mandateId the server no longer knew about, which is exactly the "reset on
 * every refresh" problem this file now fixes. HCS remains the durable *public* audit record;
 * this is the private ledger the app itself reads and writes.
 *
 * checkMandate() is the only code path where a bug loses money live — it stays pure (no I/O,
 * no Date.now() of its own) so it stays trivially testable and synchronous.
 */

const RESERVATION_TTL_MS = 120_000;

type MandateRow = {
  mandate_id: string;
  payer_account_id: string | null;
  total_ceiling_hbar: number;
  per_tx_ceiling_hbar: number;
  spent_hbar: number;
  expires_at: string;
  status: Mandate["status"];
  allowance_tx_id: string | null;
};

function fromRow(row: MandateRow): Mandate {
  return {
    mandateId: row.mandate_id,
    totalCeilingHbar: Number(row.total_ceiling_hbar),
    perTxCeilingHbar: Number(row.per_tx_ceiling_hbar),
    spentHbar: Number(row.spent_hbar),
    remainingHbar: Math.max(Number(row.total_ceiling_hbar) - Number(row.spent_hbar), 0),
    expiresAt: row.expires_at,
    status: row.status,
    payerAccountId: row.payer_account_id ?? undefined,
  };
}

export async function createMandate(input: {
  totalCeilingHbar: number;
  perTxCeilingHbar: number;
  ttlMinutes: number;
  payerAccountId?: string;
}): Promise<Mandate> {
  const row = {
    mandate_id: crypto.randomUUID(),
    payer_account_id: input.payerAccountId ?? null,
    total_ceiling_hbar: input.totalCeilingHbar,
    per_tx_ceiling_hbar: input.perTxCeilingHbar,
    spent_hbar: 0,
    expires_at: new Date(Date.now() + input.ttlMinutes * 60_000).toISOString(),
    status: "active" as const,
  };
  const { data, error } = await db().from("mandates").insert(row).select().single();
  if (error) throw new Error(`createMandate: ${error.message}`);
  return fromRow(data as MandateRow);
}

export async function getMandate(mandateId: string): Promise<Mandate | undefined> {
  const { data, error } = await db().from("mandates").select().eq("mandate_id", mandateId).maybeSingle();
  if (error) throw new Error(`getMandate: ${error.message}`);
  return data ? fromRow(data as MandateRow) : undefined;
}

/** Newest active, non-expired mandate for a payer account — how a refreshed client relocates its mandate without holding the id. */
export async function getMandateForPayer(payerAccountId: string): Promise<Mandate | undefined> {
  const { data, error } = await db()
    .from("mandates")
    .select()
    .eq("payer_account_id", payerAccountId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getMandateForPayer: ${error.message}`);
  return data ? fromRow(data as MandateRow) : undefined;
}

export async function setAllowanceTx(mandateId: string, allowanceTxId: string): Promise<void> {
  const { error } = await db().from("mandates").update({ allowance_tx_id: allowanceTxId }).eq("mandate_id", mandateId);
  if (error) throw new Error(`setAllowanceTx: ${error.message}`);
}

export async function revokeMandate(mandateId: string): Promise<void> {
  const { error } = await db()
    .from("mandates")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("mandate_id", mandateId);
  if (error) throw new Error(`revokeMandate: ${error.message}`);
}

/** A settled payment, kept per-mandate. This is also the shape the HCS `DataPayment` writer needs. */
export type SpendRecord = {
  amountHbar: number;
  transaction: string;
  payerAccountId: string;
  at: string;
};

export async function getSpendLog(mandateId: string): Promise<SpendRecord[]> {
  const { data, error } = await db()
    .from("spend_records")
    .select()
    .eq("mandate_id", mandateId)
    .order("at", { ascending: true });
  if (error) throw new Error(`getSpendLog: ${error.message}`);
  return (data ?? []).map(r => ({
    amountHbar: Number(r.amount_hbar),
    transaction: r.transaction,
    payerAccountId: r.payer_account_id,
    at: r.at,
  }));
}

async function reservedFor(mandateId: string): Promise<number> {
  // Opportunistically clear reservations older than the TTL — a crashed payment must not
  // leak headroom forever the way it would in Postgres (unlike the old in-memory Map, a
  // server restart no longer "fixes" this for us).
  const cutoff = new Date(Date.now() - RESERVATION_TTL_MS).toISOString();
  await db().from("reservations").delete().eq("mandate_id", mandateId).lt("created_at", cutoff);

  const { data, error } = await db().from("reservations").select("amount_hbar").eq("mandate_id", mandateId);
  if (error) throw new Error(`reservedFor: ${error.message}`);
  return (data ?? []).reduce((sum, r) => sum + Number(r.amount_hbar), 0);
}

/**
 * Claims headroom for a payment that is about to be attempted. Call this INSTEAD of
 * checkMandate() when you are about to actually pay, then commitSpend() once settlement
 * succeeds or releaseSpend() if it does not — a reservation that is never resolved
 * permanently withholds that headroom (until RESERVATION_TTL_MS reclaims it).
 */
export async function reserveSpend(
  mandateId: string,
  amountHbar: number,
  now: Date,
): Promise<{ ok: true; reservationId: string } | { ok: false; reason: RefusalReason; detail?: MandateFailureDetail }> {
  const mandate = await getMandate(mandateId);
  if (!mandate) return { ok: false, reason: "mandate_expired", detail: "not_found" };

  const reserved = await reservedFor(mandateId);
  const projected: Mandate = { ...mandate, spentHbar: mandate.spentHbar + reserved };
  const check = checkMandate(projected, amountHbar, now);
  if (!check.ok) return check;

  const reservationId = crypto.randomUUID();
  const { error } = await db().from("reservations").insert({
    reservation_id: reservationId,
    mandate_id: mandateId,
    amount_hbar: amountHbar,
  });
  if (error) throw new Error(`reserveSpend: ${error.message}`);
  return { ok: true, reservationId };
}

/** Converts a reservation into real spend after settlement, and logs the transaction. Atomic — see commit_spend() in schema.sql. */
export async function commitSpend(
  reservationId: string,
  settlement: { transaction: string; payerAccountId: string },
): Promise<void> {
  const { error } = await db().rpc("commit_spend", {
    p_reservation_id: reservationId,
    p_transaction: settlement.transaction,
    p_payer_account_id: settlement.payerAccountId,
  });
  if (error) throw new Error(`commitSpend: ${error.message}`);
}

/** Frees headroom when a payment never settled, so a failure costs the user nothing. */
export async function releaseSpend(reservationId: string): Promise<void> {
  const { error } = await db().from("reservations").delete().eq("reservation_id", reservationId);
  if (error) throw new Error(`releaseSpend: ${error.message}`);
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** Lazily creates and reuses the single default mandate used when a request carries no mandateId (dev/self-authorized path only). */
export async function getOrCreateDefaultMandate(): Promise<Mandate> {
  const { data, error } = await db()
    .from("mandates")
    .select()
    .is("payer_account_id", null)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getOrCreateDefaultMandate: ${error.message}`);
  if (data) return fromRow(data as MandateRow);

  return createMandate({
    totalCeilingHbar: envNumber("AGENT_MANDATE_TOTAL_HBAR", 5),
    perTxCeilingHbar: envNumber("AGENT_MANDATE_PER_TX_HBAR", 2.5),
    ttlMinutes: envNumber("AGENT_MANDATE_TTL_MINUTES", 180),
  });
}
