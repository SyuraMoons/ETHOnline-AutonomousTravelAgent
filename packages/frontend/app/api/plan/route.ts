import { NextRequest, NextResponse } from "next/server";
import type { Plan, RefusalReason } from "@sh/contracts";
import { AgentTurnError, type AgentTurnMessage, type Trip, runAgentTurn } from "~~/services/ai/travelAgent";
import { buildOptionsFromLegs } from "~~/services/autovoyage/buildOptions";
import { type OptionsTrip, toAirportCode } from "~~/services/autovoyage/flightOptions";
import { getOrCreateDefaultMandate } from "~~/services/autovoyage/mandate";
import { getSupplierCard, hbarFromTinybars, paySupplierLeg, refusalReply } from "~~/services/autovoyage/paidSearch";
import { getSessionTraveler } from "~~/services/autovoyage/profile";
import { actionRefusedEvent, dataPaymentEvent, submitAuditEvent } from "~~/services/hedera/hcsAudit";

// Accepts the full turn history ({ messages }) so the agent's follow-up
// questions are answerable; { brief } stays supported as a single-turn shorthand.
function readMessages(body: unknown): AgentTurnMessage[] | null {
  const b = body as { messages?: unknown; brief?: unknown } | null;

  if (Array.isArray(b?.messages)) {
    const messages = b.messages.filter(
      (m): m is AgentTurnMessage =>
        typeof m?.content === "string" && m.content.trim() !== "" && (m.role === "user" || m.role === "assistant"),
    );
    return messages.length > 0 ? messages : null;
  }

  if (typeof b?.brief === "string" && b.brief.trim() !== "") {
    return [{ role: "user", content: b.brief.trim() }];
  }

  return null;
}

// The search form already knows origin/destination/dates/pax, so there is
// nothing for the model to parse. When `trip` is present we skip runAgentTurn()
// entirely: one less round trip, and the form keeps working when
// OPENROUTER_API_KEY is unset. The free-text agent panel still goes via the LLM.
function readTrip(body: unknown): OptionsTrip | null {
  const t = (body as { trip?: unknown } | null)?.trip as Record<string, unknown> | undefined;
  if (!t) return null;

  const origin = typeof t.origin === "string" ? t.origin.trim() : "";
  const destination = typeof t.destination === "string" ? t.destination.trim() : "";
  const departDate = typeof t.departDate === "string" ? t.departDate.trim() : "";
  const paxCount = typeof t.paxCount === "number" ? Math.floor(t.paxCount) : 0;
  if (!origin || !destination || !departDate || paxCount < 1) return null;

  const returnDate = typeof t.returnDate === "string" && t.returnDate.trim() !== "" ? t.returnDate.trim() : undefined;

  return {
    origin,
    destination,
    departDate,
    returnDate,
    paxCount,
    cabin: typeof t.cabin === "string" && t.cabin.trim() !== "" ? t.cabin.trim() : "Economy",
  };
}

function readMandateId(body: unknown): string | null {
  const id = (body as { mandateId?: unknown } | null)?.mandateId;
  return typeof id === "string" && id.trim() !== "" ? id.trim() : null;
}

function planReply(trip: OptionsTrip, count: number): string {
  const route = `${toAirportCode(trip.origin)} → ${toAirportCode(trip.destination)}`;
  const pax = `${trip.paxCount} traveller${trip.paxCount === 1 ? "" : "s"}`;
  return `Searched ${route} for ${pax}. ${count} options came back — pick one and I'll build the plan around it.`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  // Structured path (search form) — no model call.
  let trip: OptionsTrip | null = readTrip(body);
  let reply: string | null = null;

  if (!trip) {
    const messages = readMessages(body);
    if (!messages) {
      return NextResponse.json({ status: "error", message: "messages, brief or trip is required" }, { status: 400 });
    }

    let turn;
    try {
      turn = await runAgentTurn(messages, await getSessionTraveler());
    } catch (err) {
      if (err instanceof AgentTurnError) {
        return NextResponse.json({ status: "error", message: err.message }, { status: 400 });
      }
      return NextResponse.json({ status: "error", message: "the travel agent is unavailable" }, { status: 502 });
    }

    // A greeting or a question back to the user is a normal outcome, not an error.
    if (turn.intent === "chat" || !turn.trip) {
      return NextResponse.json({ kind: "chat", reply: turn.reply });
    }

    trip = tripFromAgent(turn.trip);
    reply = turn.reply;

    // Diagnostic-only safety net: the model is the only thing stopping a one-way brief from
    // being priced as a round trip (which pays for a real, unwanted inbound leg). There's no
    // ground truth to hard-block against here, so just make a mismatch visible rather than
    // silent — see AGENTS.md-adjacent bug writeup for why this matters.
    if (turn.trip.returnDate) {
      const lastUserMessage = [...messages].reverse().find(m => m.role === "user")?.content ?? "";
      if (/\bone[- ]way\b/i.test(lastUserMessage)) {
        console.warn(
          "[plan] model set returnDate for a brief that says one-way:",
          JSON.stringify({ returnDate: turn.trip.returnDate, lastUserMessage }),
        );
      }
    }
  }

  // Minted here, before any payment or refusal, so every audit event below — including
  // consent_missing, which fires before a mandate even exists — shares the same planId as the
  // eventual Plan.planId returned on success.
  const planId = crypto.randomUUID();

  // No mandate id means no human ever authorized this spend. Refuse rather than mint one:
  // getOrCreateDefaultMandate() lets the agent authorize itself, which is only acceptable
  // while developing against the agent's own treasury balance — never against a user's
  // account. ALLOW_UNAUTHORIZED_MANDATE=true restores the old self-service behaviour.
  const requestedMandateId = readMandateId(body);
  const mandateId =
    requestedMandateId ??
    (process.env.ALLOW_UNAUTHORIZED_MANDATE === "true" ? (await getOrCreateDefaultMandate()).mandateId : null);

  if (!mandateId) {
    await submitAuditEvent(actionRefusedEvent(planId, "consent_missing"));
    return NextResponse.json({
      kind: "refusal",
      reply: refusalReply("consent_missing"),
      reason: "consent_missing" satisfies RefusalReason,
      trip,
    });
  }

  const origin = toAirportCode(trip.origin);
  const destination = toAirportCode(trip.destination);

  const outboundOutcome = await paySupplierLeg(mandateId, {
    origin,
    destination,
    departDate: trip.departDate,
    paxCount: trip.paxCount,
  });
  if (!outboundOutcome.ok) {
    await submitAuditEvent(actionRefusedEvent(planId, outboundOutcome.reason));
    return NextResponse.json({
      kind: "refusal",
      reply: refusalReply(outboundOutcome.reason, outboundOutcome.detail),
      reason: outboundOutcome.reason,
      detail: outboundOutcome.detail,
      trip,
    });
  }
  // Logged the moment settlement is confirmed, not after buildOptionsFromLegs() below — that
  // way a real, settled payment is never left off the public audit trail just because the
  // search that followed it turned out to have no usable results.
  const outboundHbar = hbarFromTinybars(outboundOutcome.result.amountTinybars);
  await submitAuditEvent(
    dataPaymentEvent(planId, {
      amountHbar: outboundHbar,
      payTo: outboundOutcome.result.payTo,
      txId: outboundOutcome.result.transaction,
    }),
  );

  let inboundOutcome: Awaited<ReturnType<typeof paySupplierLeg>> | null = null;
  let inboundHbar = 0;
  if (trip.returnDate) {
    inboundOutcome = await paySupplierLeg(mandateId, {
      origin: destination,
      destination: origin,
      departDate: trip.returnDate,
      paxCount: trip.paxCount,
    });
    if (!inboundOutcome.ok) {
      await submitAuditEvent(actionRefusedEvent(planId, inboundOutcome.reason));
      return NextResponse.json({
        kind: "refusal",
        reply: refusalReply(inboundOutcome.reason, inboundOutcome.detail),
        reason: inboundOutcome.reason,
        detail: inboundOutcome.detail,
        trip,
      });
    }
    inboundHbar = hbarFromTinybars(inboundOutcome.result.amountTinybars);
    await submitAuditEvent(
      dataPaymentEvent(planId, {
        amountHbar: inboundHbar,
        payTo: inboundOutcome.result.payTo,
        txId: inboundOutcome.result.transaction,
      }),
    );
  }

  const outboundLegs = outboundOutcome.result.body.results;
  const inboundLegs = inboundOutcome?.ok ? inboundOutcome.result.body.results : [];

  const options = buildOptionsFromLegs({
    outboundLegs,
    inboundLegs,
    paxCount: trip.paxCount,
    cabin: trip.cabin,
  });

  if (options.length === 0) {
    // Both legs above already settled and were already audited as DataPayment — this refusal
    // must say so, never imply nothing was spent.
    await submitAuditEvent(actionRefusedEvent(planId, "quote_expired"));
    return NextResponse.json({
      kind: "refusal",
      reply: `I paid for the search (${(outboundHbar + inboundHbar).toFixed(4)} HBAR) but the supplier returned no usable flight pairings for that route and date.`,
      reason: "quote_expired",
      trip,
      payment: {
        amountHbar: (outboundHbar + inboundHbar).toFixed(4),
        outbound: { amountHbar: outboundHbar.toFixed(4), transaction: outboundOutcome.result.transaction },
        inbound: inboundOutcome?.ok
          ? { amountHbar: inboundHbar.toFixed(4), transaction: inboundOutcome.result.transaction }
          : undefined,
      },
    });
  }

  const best = options[0];

  const plan: Plan = {
    planId,
    itineraryHash: best.itineraryHash,
    legs: best.legs,
    paxCount: trip.paxCount,
    fareTotalMinor: best.totalMinor,
    currency: best.currency,
    refusals: [],
    createdAt: new Date().toISOString(),
  };

  const card = await getSupplierCard().catch(() => null);
  const payTo = outboundOutcome.result.payTo;

  return NextResponse.json({
    kind: "plan",
    reply: reply ?? planReply(trip, options.length),
    trip,
    plan,
    options,
    payment: {
      amountHbar: (outboundHbar + inboundHbar).toFixed(4),
      supplier: card?.name ?? "Meridian Flight Data",
      payTo,
      resultCount: options.length,
      quoteId: outboundOutcome.result.body.quoteId,
      transaction: outboundOutcome.result.transaction,
      hashscanUrl: `https://hashscan.io/testnet/transaction/${outboundOutcome.result.transaction}`,
      outbound: {
        amountHbar: outboundHbar.toFixed(4),
        transaction: outboundOutcome.result.transaction,
        hashscanUrl: `https://hashscan.io/testnet/transaction/${outboundOutcome.result.transaction}`,
      },
      inbound: inboundOutcome?.ok
        ? {
            amountHbar: inboundHbar.toFixed(4),
            transaction: inboundOutcome.result.transaction,
            hashscanUrl: `https://hashscan.io/testnet/transaction/${inboundOutcome.result.transaction}`,
          }
        : undefined,
    },
  });
}

function tripFromAgent(trip: Trip): OptionsTrip {
  return {
    origin: trip.origin,
    destination: trip.destination,
    departDate: trip.departDate,
    returnDate: trip.returnDate,
    paxCount: trip.paxCount,
    cabin: "Economy",
  };
}
