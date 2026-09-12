import type {
  ActivityOffer,
  DossierStay,
  FlightOption,
  ItineraryDay,
  PlanActivity,
  StayOffer,
  TripDossier,
} from "@sh/contracts";
import { itineraryHash } from "@sh/contracts";
import { randomUUID } from "node:crypto";
import { TripAgentError, type TripAgentMessage, runTripAgentStep } from "~~/services/ai/tripAgent";
import { buildOptionsFromLegs } from "~~/services/autovoyage/buildOptions";
import { type MandateFailureDetail } from "~~/services/autovoyage/mandate";
import {
  type OperationalReason,
  hbarFromTinybars,
  payActivities,
  payStays,
  paySupplierLeg,
  refusalReply,
} from "~~/services/autovoyage/paidSearch";
import { resolveActivities, resolveStay } from "~~/services/autovoyage/resolveSelections";
import type { ActivitySearchQuery, StaySearchQuery } from "~~/services/autovoyage/supplierClient";

/**
 * Drives the tool-calling loop in services/ai/tripAgent.ts and owns every guardrail the model
 * itself is not trusted with: the search spend cap, the mandate check on every paid call, and
 * turning "the model called finalize" into a saved TripDossier. Nothing here pays anything the
 * model asked for without paidSearch.ts's reserve/pay/commit cycle checking it against the
 * mandate's real ceiling first.
 */

const MAX_MODEL_TURNS = 6;
const MAX_PAID_SEARCHES = 2;
// Booking costs no HBAR. HBAR bought the DATA — the searches above — and the
// fare settles against the traveller's card, which is a different amount owed to
// a different party. The button shows the fare, because that is what the person
// pressing it is agreeing to pay.

export type RunStepStatus = "active" | "done" | "error";
export type RunStep = { id: string; label: string; status: RunStepStatus; note?: string };

export type RunPaymentEvent = { leg: string; amountHbar: string; transaction: string; hashscanUrl: string };

export type RunEvent =
  | { type: "step"; step: RunStep }
  | { type: "payment"; payment: RunPaymentEvent }
  | { type: "dossier"; dossier: TripDossier }
  | { type: "refusal"; reason: OperationalReason; detail?: MandateFailureDetail; reply: string }
  | { type: "chat"; reply: string }
  | { type: "error"; message: string }
  | { type: "done" };

type SearchSpend = { amountHbar: string; transaction: string; hashscanUrl: string };

type SearchRecord = {
  origin: string;
  destination: string;
  departDate: string;
  paxCount: number;
  legs: FlightOption["legs"];
  amountHbar: string;
  transaction: string;
  hashscanUrl: string;
};

function hashscanUrl(transaction: string): string {
  return `https://hashscan.io/testnet/transaction/${transaction}`;
}

/** Picks the FlightOption matching the model's chosen offerId(s); falls back to the top-ranked
 * option if the model named something that isn't actually in the results — never trust a
 * model-supplied id blindly for what becomes the priced, hashed itinerary. */
function resolveChosenOption(
  options: FlightOption[],
  outboundOfferId: string,
  inboundOfferId: string | null,
): FlightOption {
  const match = options.find(o => {
    const [out, ret] = o.legs;
    if (out?.offerId !== outboundOfferId) return false;
    if (inboundOfferId) return ret?.offerId === inboundOfferId;
    return true;
  });
  return match ?? options[0];
}

function buildDossier(params: {
  searches: SearchRecord[];
  option: FlightOption;
  days: ItineraryDay[];
  paxCount: number;
  stay?: DossierStay;
  activities?: PlanActivity[];
  /** Stay and activity searches, which aren't SearchRecords — they have no legs. */
  extraSpend?: SearchSpend[];
}): TripDossier {
  const { searches, option, days, paxCount, stay } = params;
  const activities = params.activities ?? [];
  const outbound = searches[0];
  const inbound = searches[1];

  const bookable = option.legs.every(leg => leg.fromInventory === true);

  // The fare covers everything the card will be charged for, so the stay and the activities
  // count toward it. option.totalMinor is flights only; using it as the trip total would
  // disagree with what the supplier bills at booking, and the hash below would be anchored to
  // a number nobody is actually paying.
  const fareTotalMinor =
    option.totalMinor +
    (stay?.priceMinor ?? 0) +
    activities.reduce((total, activity) => total + activity.priceMinor, 0);

  const dossierId = randomUUID();
  const createdAt = new Date().toISOString();

  return {
    dossierId,
    createdAt,
    trip: {
      origin: outbound.origin,
      destination: outbound.destination,
      departDate: outbound.departDate,
      returnDate: inbound?.departDate,
      paxCount,
      cabin: "Economy",
    },
    option,
    ...(stay ? { stay } : {}),
    activities,
    // Recomputed over the whole trip. option.itineraryHash covers the flights alone, which is
    // the right anchor for an *option* but the wrong one for an approval: it would still match
    // after the hotel was swapped out from under it.
    itineraryHash: itineraryHash({
      planId: dossierId,
      legs: option.legs,
      stay,
      activities,
      paxCount,
      fareTotalMinor,
      currency: option.currency,
      refusals: [],
      createdAt,
    }),
    days,
    fareTotalMinor,
    currency: option.currency,
    bookable,
    notBookableReason: bookable
      ? undefined
      : "One or more of these offers aren't in the supplier's real inventory yet, so they can't be booked automatically.",
    // Every settled search, not just the flights — this is the trip's HBAR bill, and leaving
    // a paid hotel search off it would understate what the agent actually spent.
    searchSpend: [
      ...searches.map(s => ({
        amountHbar: s.amountHbar,
        transaction: s.transaction,
        hashscanUrl: s.hashscanUrl,
      })),
      ...(params.extraSpend ?? []),
    ],
  };
}

export async function runAutonomous(params: {
  brief: string;
  mandateId: string;
  onEvent: (event: RunEvent) => void;
}): Promise<void> {
  const { brief, mandateId, onEvent } = params;

  const messages: TripAgentMessage[] = [{ role: "user", content: brief }];
  const searches: SearchRecord[] = [];
  let days: ItineraryDay[] = [];
  let draftedItinerary = false;
  // Paid results the model may later name in finalize. Held here, not in the transcript: an id
  // the model invents must resolve to nothing rather than to something we then charge a card
  // for — the same rule resolveChosenOption() applies to flights.
  let stayOffers: StayOffer[] = [];
  // The local calendar dates the stay was searched for. StayOffer carries only instants, and
  // POST /v1/booking wants dates in the property's own timezone — see DossierStay.
  let stayDates: { checkIn: string; checkOut: string } | null = null;
  let activityOffers: ActivityOffer[] = [];
  const extraSpend: SearchSpend[] = [];

  onEvent({ type: "step", step: { id: "understand", label: "Reading your brief", status: "active" } });

  for (let turn = 0; turn < MAX_MODEL_TURNS; turn++) {
    let message;
    try {
      message = await runTripAgentStep(messages);
    } catch (err) {
      const detail = err instanceof TripAgentError ? err.message : "the travel agent is unavailable";
      onEvent({ type: "error", message: detail });
      return;
    }

    if (turn === 0) {
      onEvent({ type: "step", step: { id: "understand", label: "Reading your brief", status: "done" } });
    }

    messages.push({ role: "assistant", content: message.content, tool_calls: message.tool_calls });

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      // No tool call at all — the model is talking, not planning (a clarification it was told
      // not to ask, or a plain greeting). Surface it as a chat reply and end the run rather
      // than looping on a turn that will never make progress.
      onEvent({ type: "chat", reply: message.content ?? "I couldn't plan that." });
      return;
    }

    for (const call of toolCalls) {
      const args = safeParseArgs(call.function.arguments);

      if (call.function.name === "search_flights") {
        if (searches.length >= MAX_PAID_SEARCHES) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({
              error: `Search budget exhausted (${MAX_PAID_SEARCHES}/${MAX_PAID_SEARCHES} paid searches already used). Decide with what you already have.`,
            }),
          });
          continue;
        }

        const query = args as { origin: string; destination: string; departDate: string; paxCount: number };
        const stepId = `search-${searches.length + 1}`;
        onEvent({
          type: "step",
          step: { id: stepId, label: `Searching ${query.origin} → ${query.destination}`, status: "active" },
        });

        const outcome = await paySupplierLeg(mandateId, query);
        if (!outcome.ok) {
          onEvent({
            type: "step",
            step: { id: stepId, label: `Searching ${query.origin} → ${query.destination}`, status: "error" },
          });
          onEvent({
            type: "refusal",
            reason: outcome.reason,
            detail: outcome.detail,
            reply: refusalReply(outcome.reason, outcome.detail),
          });
          return;
        }

        const amountHbar = hbarFromTinybars(outcome.result.amountTinybars).toFixed(4);
        const transaction = outcome.result.transaction;
        const record: SearchRecord = {
          origin: query.origin,
          destination: query.destination,
          departDate: query.departDate,
          paxCount: query.paxCount,
          legs: outcome.result.body.results,
          amountHbar,
          transaction,
          hashscanUrl: hashscanUrl(transaction),
        };
        searches.push(record);

        onEvent({
          type: "step",
          step: { id: stepId, label: `Searching ${query.origin} → ${query.destination}`, status: "done" },
        });
        onEvent({
          type: "payment",
          payment: {
            leg: `${query.origin} → ${query.destination}`,
            amountHbar,
            transaction,
            hashscanUrl: record.hashscanUrl,
          },
        });

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            resultCount: record.legs.length,
            results: record.legs.map(l => ({
              offerId: l.offerId,
              airline: l.airline,
              flightNumber: l.flightNumber,
              departUtc: l.departUtc,
              arriveUtc: l.arriveUtc,
              priceMinor: l.priceMinor,
              currency: l.currency,
            })),
          }),
        });
        continue;
      }

      if (call.function.name === "search_stays" || call.function.name === "search_activities") {
        const stays = call.function.name === "search_stays";
        const already = stays ? stayOffers.length > 0 : activityOffers.length > 0;
        if (already) {
          // One paid search per domain. The cap is the point: a model that keeps refining a
          // query spends real HBAR on every attempt.
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: "You have already paid for that search. Decide with what you have." }),
          });
          continue;
        }

        const label = stays ? "Searching hotels" : "Searching activities";
        const stepId = stays ? "search-stays" : "search-activities";
        onEvent({ type: "step", step: { id: stepId, label, status: "active" } });

        const stayQuery = args as StaySearchQuery;
        const outcome = stays
          ? await payStays(mandateId, stayQuery)
          : await payActivities(mandateId, args as ActivitySearchQuery);

        if (!outcome.ok) {
          // NOT fatal, unlike a failed flight search. The flights are already bought and
          // audited; ending the run here would throw away a trip the user already paid for
          // because an optional extra could not be afforded. Tell the model and let it
          // finalize without one.
          onEvent({ type: "step", step: { id: stepId, label, status: "error" } });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: refusalReply(outcome.reason, outcome.detail) }),
          });
          continue;
        }

        const amountHbar = hbarFromTinybars(outcome.result.amountTinybars).toFixed(4);
        const transaction = outcome.result.transaction;
        extraSpend.push({ amountHbar, transaction, hashscanUrl: hashscanUrl(transaction) });

        onEvent({ type: "step", step: { id: stepId, label, status: "done" } });
        onEvent({
          type: "payment",
          payment: {
            leg: stays ? "Hotels" : "Activities",
            amountHbar,
            transaction,
            hashscanUrl: hashscanUrl(transaction),
          },
        });

        if (stays) {
          stayOffers = outcome.result.body.results as StayOffer[];
          stayDates = { checkIn: stayQuery.checkIn, checkOut: stayQuery.checkOut };
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({
              resultCount: stayOffers.length,
              results: stayOffers.map(o => ({
                hotelId: o.hotelId,
                name: o.name,
                area: o.area,
                starRating: o.starRating,
                nights: o.nights,
                priceMinor: o.priceMinor,
                currency: o.currency,
              })),
            }),
          });
        } else {
          activityOffers = outcome.result.body.results as ActivityOffer[];
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({
              resultCount: activityOffers.length,
              results: activityOffers.map(o => ({
                activityId: o.activityId,
                name: o.name,
                startUtc: o.startUtc,
                priceMinor: o.priceMinor,
                currency: o.currency,
              })),
            }),
          });
        }
        continue;
      }

      if (call.function.name === "draft_itinerary") {
        onEvent({ type: "step", step: { id: "itinerary", label: "Drafting the day plan", status: "active" } });
        const parsed = args as { days: Omit<ItineraryDay, "source">[] };
        days = parsed.days.map(d => ({ ...d, source: "agent_suggestion" as const }));
        draftedItinerary = true;
        onEvent({ type: "step", step: { id: "itinerary", label: "Drafting the day plan", status: "done" } });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ recorded: days.length }) });
        continue;
      }

      if (call.function.name === "finalize") {
        if (searches.length === 0) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: "You haven't searched any flights yet — call search_flights first." }),
          });
          continue;
        }
        if (!draftedItinerary) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({ error: "Call draft_itinerary before finalize." }),
          });
          continue;
        }

        onEvent({ type: "step", step: { id: "finalize", label: "Assembling your report", status: "active" } });
        const parsed = args as {
          outboundOfferId: string;
          inboundOfferId: string | null;
          stayHotelId?: string | null;
          activityIds?: string[];
          summary: string;
        };

        const options = buildOptionsFromLegs({
          outboundLegs: searches[0].legs,
          inboundLegs: searches[1]?.legs ?? [],
          paxCount: searches[0].paxCount,
        });
        if (options.length === 0) {
          onEvent({ type: "step", step: { id: "finalize", label: "Assembling your report", status: "error" } });
          onEvent({ type: "error", message: "The supplier returned no flights for that route and date." });
          return;
        }

        const chosen = resolveChosenOption(options, parsed.outboundOfferId, parsed.inboundOfferId);
        const dossier = buildDossier({
          searches,
          option: chosen,
          days,
          paxCount: searches[0].paxCount,
          stay: resolveStay(stayOffers, stayDates, parsed.stayHotelId ?? null),
          activities: resolveActivities(activityOffers, parsed.activityIds ?? []),
          extraSpend,
        });

        onEvent({ type: "step", step: { id: "finalize", label: "Assembling your report", status: "done" } });
        onEvent({ type: "dossier", dossier });
        onEvent({ type: "done" });
        return;
      }
    }
  }

  // Step limit reached without an explicit finalize — force one from whatever state exists
  // rather than leaving the user with nothing after real HBAR was already spent on searches.
  if (searches.length > 0) {
    const options = buildOptionsFromLegs({
      outboundLegs: searches[0].legs,
      inboundLegs: searches[1]?.legs ?? [],
      paxCount: searches[0].paxCount,
    });
    if (options.length > 0) {
      const dossier = buildDossier({
        searches,
        option: options[0],
        days,
        paxCount: searches[0].paxCount,
        extraSpend,
      });
      onEvent({ type: "dossier", dossier });
      onEvent({ type: "done" });
      return;
    }
  }

  onEvent({ type: "error", message: "I ran out of planning steps without finding a flight to report." });
}

function safeParseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}
