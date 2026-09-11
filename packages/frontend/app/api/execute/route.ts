import { NextResponse } from "next/server";
import {
  ExecuteRequest,
  type ExecuteResponse,
  type ExecutedBooking,
  type RefusalReason,
  itineraryHash,
} from "@sh/contracts";
import { getDossier } from "~~/services/autovoyage/dossierStore";
import { verifyExecutionToken } from "~~/services/autovoyage/executionToken";
import { type OperationalReason, hbarFromTinybars, payBooking, refusalReply } from "~~/services/autovoyage/paidSearch";
import { actionRefusedEvent, bookingExecutedEvent, submitAuditEvent } from "~~/services/hedera/hcsAudit";

function hashscanUrl(transaction: string): string {
  return `https://hashscan.io/testnet/transaction/${transaction}`;
}

const CLOSED_REASONS = new Set<RefusalReason>([
  "per_tx_ceiling_exceeded",
  "total_ceiling_exceeded",
  "mandate_expired",
  "consent_missing",
  "consent_expired",
  "itinerary_mismatch",
  "quote_expired",
]);

/** supplier_unreachable / payment_rejected aren't in the closed RefusalReason set (see
 * AGENTS.md "Refusal reason codes") — quote_expired is the closest existing code for "this
 * booking attempt could not be completed" without inventing a new protocol reason. */
function toRefusalReason(reason: OperationalReason): RefusalReason {
  return CLOSED_REASONS.has(reason as RefusalReason) ? (reason as RefusalReason) : "quote_expired";
}

async function refused(planId: string, reason: RefusalReason, detail?: string, message?: string) {
  await submitAuditEvent(actionRefusedEvent(planId, reason));
  const response: ExecuteResponse = {
    status: "refused",
    bookings: [],
    totalHbarPaid: "0.0000",
    refusal: { reason, detail, message: message ?? refusalReply(reason) },
  };
  return NextResponse.json(response);
}

// Spends the execution token minted at consent-verify: re-derives the itineraryHash
// server-side from the STORED dossier (never a client-sent hash — see AGENTS.md "Itinerary
// hash"), rejects a mismatch, then actually books every leg via the supplier's real
// POST /v1/booking. Bookings are sequential and NOT rolled back on partial failure — the
// supplier has no cancel endpoint and every confirmation is CONFIRMED_SIMULATED, so a partial
// result is reported honestly rather than hidden behind an all-or-nothing status.
export async function POST(request: Request) {
  const parsed = ExecuteRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { dossierId, executionToken, mandateId, passenger } = parsed.data;

  let claims;
  try {
    claims = verifyExecutionToken(executionToken);
  } catch {
    return await refused(
      dossierId,
      "consent_expired",
      undefined,
      "Your confirmation has expired — confirm the booking again.",
    );
  }
  if (claims.mandateId && claims.mandateId !== mandateId) {
    return await refused(
      dossierId,
      "consent_expired",
      undefined,
      "This confirmation wasn't issued for the current spending budget.",
    );
  }

  const dossier = await getDossier(dossierId);
  if (!dossier) {
    return await refused(
      dossierId,
      "consent_expired",
      undefined,
      "This trip report has expired — plan the trip again.",
    );
  }

  // Re-derive from the legs the SERVER stored at planning time, not anything the client sent.
  const recomputedHash = itineraryHash({
    planId: dossier.dossierId,
    legs: dossier.option.legs,
    paxCount: dossier.trip.paxCount,
    fareTotalMinor: dossier.fareTotalMinor,
    currency: dossier.currency,
    refusals: [],
    createdAt: dossier.createdAt,
  });
  if (recomputedHash !== claims.itineraryHash || recomputedHash !== dossier.itineraryHash) {
    return await refused(dossierId, "itinerary_mismatch");
  }

  if (!dossier.bookable) {
    return await refused(
      dossierId,
      "quote_expired",
      undefined,
      dossier.notBookableReason ?? "These offers aren't in the supplier's real inventory and can't be booked.",
    );
  }

  const bookings: ExecutedBooking[] = [];
  let totalHbar = 0;
  let failed: { offerId: string; reason: RefusalReason; message: string } | null = null;

  for (const leg of dossier.option.legs) {
    const outcome = await payBooking(mandateId, leg.offerId, passenger);
    if (!outcome.ok) {
      await submitAuditEvent(actionRefusedEvent(dossierId, outcome.reason));
      failed = {
        offerId: leg.offerId,
        reason: toRefusalReason(outcome.reason),
        message: refusalReply(outcome.reason, outcome.detail),
      };
      break;
    }
    const amountHbar = hbarFromTinybars(outcome.result.amountTinybars);
    totalHbar += amountHbar;
    bookings.push({
      offerId: leg.offerId,
      bookingId: outcome.result.body.bookingId,
      confirmationCode: outcome.result.body.confirmationCode,
      amountHbar: amountHbar.toFixed(4),
      transaction: outcome.result.transaction,
      hashscanUrl: hashscanUrl(outcome.result.transaction),
    });
  }

  if (!failed) {
    await submitAuditEvent(
      bookingExecutedEvent(dossierId, {
        bookingId: bookings.map(b => b.bookingId).join(","),
        fareTotalMinor: dossier.fareTotalMinor,
        currency: dossier.currency,
      }),
    );
  }

  const response: ExecuteResponse = {
    status: failed ? (bookings.length > 0 ? "partial" : "refused") : "booked",
    bookings,
    totalHbarPaid: totalHbar.toFixed(4),
    failed: failed && bookings.length > 0 ? { offerId: failed.offerId, reason: failed.message } : undefined,
    refusal: failed && bookings.length === 0 ? { reason: failed.reason, message: failed.message } : undefined,
  };
  return NextResponse.json(response);
}
