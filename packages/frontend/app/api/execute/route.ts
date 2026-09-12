import { NextResponse } from "next/server";
import {
  ExecuteRequest,
  type ExecuteResponse,
  type ExecutedBooking,
  type RefusalReason,
  itineraryHash,
} from "@sh/contracts";
import { getDossier } from "~~/services/autovoyage/dossierStore";
import { claimExecutionToken, verifyExecutionToken } from "~~/services/autovoyage/executionToken";
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
  const { dossierId, executionToken, mandateId, passenger, payment } = parsed.data;

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
  // Unconditional now — mandateId is a required claim (see executionToken.ts). It used to be
  // optional, so a token minted without it skipped this check entirely and was redeemable
  // against ANY mandateId the caller named here.
  if (claims.mandateId !== mandateId) {
    return await refused(
      dossierId,
      "consent_expired",
      undefined,
      "This confirmation wasn't issued for the current spending budget.",
    );
  }
  // Single-use: burn the token's jti before booking anything. Without this, the same
  // executionToken could be replayed for the remainder of its TTL, booking (and paying for)
  // every leg again on each replay.
  if (!(await claimExecutionToken(claims.jti))) {
    return await refused(
      dossierId,
      "consent_expired",
      undefined,
      "This confirmation was already used — confirm the booking again.",
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

  // ONE booking call for the whole itinerary. It used to be one per leg, which
  // meant a single approval authorising several payments that could fail
  // independently — a two-leg trip could end up half-booked with the user
  // already charged for the part that went through. The supplier resolves and
  // validates every component before confirming anything, so this either
  // returns one signed confirmation covering the lot or changes nothing.
  //
  // No HBAR moves here. The fare settles against the traveller's card, so the
  // mandate is not consulted: it governs the agent's HBAR, and the agent's HBAR
  // was spent on searches, which were charged and audited as they happened.
  const outcome = await payBooking(
    { legs: dossier.option.legs.map(leg => ({ offerId: leg.offerId })) },
    passenger,
    payment,
  );

  if (!outcome.ok) {
    await submitAuditEvent(actionRefusedEvent(dossierId, outcome.reason));
    const refusedResponse: ExecuteResponse = {
      status: "refused",
      bookings: [],
      totalHbarPaid: "0.0000",
      refusal: {
        reason: toRefusalReason(outcome.reason),
        message: refusalReply(outcome.reason),
      },
    };
    return NextResponse.json(refusedResponse);
  }

  const confirmed = outcome.body.confirmed;
  if (!confirmed) {
    // A 200 with no confirmation is the supplier contradicting itself.
    await submitAuditEvent(actionRefusedEvent(dossierId, "quote_expired"));
    return NextResponse.json({
      status: "refused",
      bookings: [],
      totalHbarPaid: "0.0000",
      refusal: { reason: "quote_expired", message: refusalReply("quote_expired") },
    } satisfies ExecuteResponse);
  }

  // One confirmation covers every leg, so each row carries the same booking id
  // and the same charge — these are parts of one reservation, and the card was
  // charged once for the lot, not per leg.
  const bookings: ExecutedBooking[] = dossier.option.legs.map(leg => ({
    offerId: leg.offerId,
    bookingId: outcome.body.bookingId,
    confirmationCode: outcome.body.confirmationCode,
    fareChargedMinor: confirmed.fareCharged.amountMinor,
    currency: confirmed.fareCharged.currency,
    cardLast4: confirmed.fareCharged.last4,
  }));

  await submitAuditEvent(
    bookingExecutedEvent(dossierId, {
      bookingId: outcome.body.bookingId,
      fareTotalMinor: confirmed.totalMinor,
      currency: confirmed.currency,
    }),
  );

  const response: ExecuteResponse = {
    status: "booked",
    bookings,
    // The agent spent no HBAR booking. What it spent on searches is audited
    // per payment as those happened, not summed here.
    totalHbarPaid: "0.0000",
  };
  return NextResponse.json(response);
}
