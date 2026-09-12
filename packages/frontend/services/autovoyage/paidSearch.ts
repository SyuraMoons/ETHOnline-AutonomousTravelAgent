import type { PaymentInstrument } from "@sh/contracts";
import type { BookingResponse, RefusalReason } from "@sh/contracts";
import {
  type MandateFailureDetail,
  commitSpend,
  getMandate,
  releaseSpend,
  reserveSpend,
} from "~~/services/autovoyage/mandate";
import { type SearchQuery, getSupplierCard, paySearch, quoteSearch } from "~~/services/autovoyage/supplierClient";
import { PaymentFailedError, SupplierUnreachableError, pay, quote } from "~~/services/x402/agentBuyer";

/**
 * The quote -> check-mandate -> pay -> record cycle, as one paid-tool-call primitive.
 * Extracted from app/api/plan/route.ts so /api/plan, the autonomous run loop, and
 * /api/execute all share one reservation-safe implementation instead of drifting apart.
 */

const TINYBAR_PER_HBAR = 100_000_000;

/**
 * Operational failures, deliberately NOT members of the closed RefusalReason set — those
 * describe mandate/consent *decisions*, these describe things going wrong. Kept distinct
 * from each other because conflating them misdiagnoses the user's own actions: revoking an
 * allowance is not the supplier being down.
 */
export type OperationalReason = RefusalReason | "supplier_unreachable" | "payment_rejected";

export function operationalReason(err: unknown): OperationalReason | null {
  if (err instanceof SupplierUnreachableError) return "supplier_unreachable";
  // The supplier answered; the transfer itself was refused — most often because the on-chain
  // allowance was revoked or spent, which Hedera rejects at consensus regardless of what the
  // app-level mandate believes.
  if (err instanceof PaymentFailedError) return "payment_rejected";
  return null;
}

export function refusalReply(reason: OperationalReason, detail?: MandateFailureDetail): string {
  switch (reason) {
    case "mandate_expired":
      switch (detail) {
        case "not_found":
          return "I don't have an active budget for this session anymore — let's set a new one.";
        case "revoked":
          return "Your spending allowance was revoked, so I can't pay for a search right now. Set a new budget and approve a fresh allowance.";
        case "exhausted":
          return "The spending mandate is used up, so I can't pay for a search right now. Set a new budget to keep going.";
        case "ttl_expired":
        default:
          return "Your spending window ran out. Set a fresh budget and I'll pick up where we left off.";
      }
    case "per_tx_ceiling_exceeded":
      return "That search would cost more than the mandate's per-transaction limit allows.";
    case "total_ceiling_exceeded":
      return "The mandate's total spending limit has been reached.";
    case "supplier_unreachable":
      return "The flight data supplier is unreachable right now — I couldn't pay for a search.";
    case "consent_missing":
      return "I need your authorization before I can spend anything. Set a trip budget and approve the allowance, and I'll take it from there.";
    case "payment_rejected":
      return "The network rejected the payment — your spending allowance has probably been revoked or used up. Approve a new allowance and I'll try again.";
    default:
      return `I couldn't complete that search (${reason}).`;
  }
}

export function hbarFromTinybars(tinybars: bigint): number {
  return Number(tinybars) / TINYBAR_PER_HBAR;
}

export type LegSearch = Awaited<ReturnType<typeof paySearch>>;

export type PaidOutcome<T> =
  { ok: true; result: T } | { ok: false; reason: OperationalReason; detail?: MandateFailureDetail };

/**
 * Quote-then-pay: the mandate is checked against the REAL quoted price before any HBAR moves.
 * This ordering is the whole point of checkMandate() being "the only code path where a bug
 * loses money" — paying first and checking after would let an over-ceiling search settle
 * anyway.
 */
export async function paySupplierLeg(mandateId: string, query: SearchQuery): Promise<PaidOutcome<LegSearch>> {
  const mandate = await getMandate(mandateId);
  if (!mandate) return { ok: false, reason: "mandate_expired", detail: "not_found" };

  // Whose money: the user who granted the allowance, or the agent's own balance when the
  // mandate predates the allowance flow. Bound into the quote so pay() cannot diverge.
  const payFrom = mandate.payerAccountId;

  let quoted: Awaited<ReturnType<typeof quoteSearch>>;
  try {
    quoted = await quoteSearch(query, payFrom);
  } catch (err) {
    const reason = operationalReason(err);
    if (reason) return { ok: false, reason };
    throw err;
  }

  const amountHbar = hbarFromTinybars(quoted.quote.amountTinybars);
  const reservation = await reserveSpend(mandateId, amountHbar, new Date());
  if (!reservation.ok) return { ok: false, reason: reservation.reason, detail: reservation.detail };

  let result: LegSearch;
  try {
    result = await paySearch(quoted.url, quoted.quote);
  } catch (err) {
    // Nothing settled, so the headroom must go back — a failed payment costs nothing.
    await releaseSpend(reservation.reservationId);
    const reason = operationalReason(err);
    if (reason) return { ok: false, reason };
    throw err;
  }

  await commitSpend(reservation.reservationId, {
    transaction: result.transaction,
    payerAccountId: result.payer,
  });
  return { ok: true, result };
}

export type BookingLegResult = Awaited<ReturnType<typeof pay<BookingResponse>>>;

function bookingUrl(): string {
  return `${process.env.SUPPLIER_BASE_URL ?? "http://localhost:4100"}/v1/booking`;
}

/**
 * Same reserve/pay/commit shape as paySupplierLeg, but POSTs a BookingRequest against the
 * supplier's flat-fee /v1/booking route instead of the priced search.
 *
 * ONE call for the whole itinerary, not one per leg. A human approves one itineraryHash, so
 * one approval has to close over one booking — booking leg by leg meant a single approval
 * authorising several payments that could fail independently, leaving an approved itinerary
 * half-executed. The supplier now resolves and validates every component before confirming
 * anything, so the call either returns one signed confirmation covering the lot or changes
 * nothing. The fee is flat regardless of what the itinerary contains.
 */
/**
 * Books an itinerary. NOT an x402 payment.
 *
 * HBAR buys data, and the searches already charged for that. The fare is a
 * different amount owed to a different party, and it settles against the
 * traveller's card — so this is a plain POST, there is no quote to reserve
 * against, and the mandate is not consulted. The mandate governs HBAR, and no
 * HBAR moves here.
 *
 * The card is simulated end to end. `DEMO_CARD` exists so a demo runs without
 * one wired up; a real deployment would require the caller to supply one.
 */
const DEMO_CARD: PaymentInstrument = {
  method: "card",
  token: "tok_test_demo0001",
  brand: "visa",
  last4: "4242",
  holderName: "AutoVoyage Demo",
};

export type BookingOutcome =
  { ok: true; body: BookingResponse } | { ok: false; reason: OperationalReason; detail?: string };

export async function payBooking(
  itinerary: {
    legs: { offerId: string }[];
    stay?: { hotelId: string; checkIn: string; checkOut: string };
    activities?: { activityId: string; startUtc: string }[];
  },
  passenger: { name: string; email: string },
  payment: PaymentInstrument = DEMO_CARD,
): Promise<BookingOutcome> {
  const body = {
    legs: itinerary.legs,
    ...(itinerary.stay ? { stay: itinerary.stay } : {}),
    activities: itinerary.activities ?? [],
    passengerName: passenger.name,
    passengerEmail: passenger.email,
    payment,
  };

  let response: Response;
  try {
    response = await fetch(bookingUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: "supplier_unreachable" };
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    // The supplier refuses a booking it cannot resolve — an unknown offer, an
    // activity slot it does not run, a card number where a token belongs.
    return { ok: false, reason: "payment_rejected", detail: detail.slice(0, 200) };
  }

  return { ok: true, body: (await response.json()) as BookingResponse };
}

export { getSupplierCard };
