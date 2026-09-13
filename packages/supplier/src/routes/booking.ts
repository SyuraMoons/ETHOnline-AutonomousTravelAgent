import { Router } from "express";
import { createHash, randomUUID } from "node:crypto";
import {
  assertNoPan,
  BookingRequest,
  type BookingConfirmation,
  type BookingResponse,
} from "@sh/contracts";
import { findOfferById } from "../lib/inventory.js";
import { findStayById, localTimeToUtc, priceStay } from "../lib/staysCache.js";
import { findActivityById, runsAt } from "../lib/activitiesCache.js";
import { signPayload } from "../lib/signing.js";

export const bookingRouter = Router();

/**
 * Books one whole itinerary: flights, and optionally a stay and some activities.
 *
 * NOT x402-gated, and deliberately so. HBAR buys data — that is what this
 * supplier sells and what the metered searches charge for. The fare is a
 * different amount owed to a different party (the airline, the hotel), and it
 * settles against the traveller's card. Charging HBAR here as well would be
 * charging twice for one action, in two currencies, to two recipients.
 *
 * Every component is resolved and validated BEFORE anything is confirmed, so a
 * request either produces one signed confirmation covering the lot or changes
 * nothing. That matters because a human approves one itineraryHash: booking the
 * pieces separately would let a single approval authorise several actions that
 * can fail independently, leaving an approved itinerary in a state no status can
 * honestly describe.
 *
 * Prices come from the supplier's own inventory, never from the request — the
 * same rule as /api/execute re-deriving the itinerary hash rather than trusting
 * a client-sent one.
 */
bookingRouter.post("/v1/booking", (req, res) => {
  // Before anything else, including validation errors that would echo the body
  // into a log line: refuse a real card number outright.
  try {
    assertNoPan(req.body);
  } catch (error) {
    res
      .status(400)
      .json({ error: error instanceof Error ? error.message : String(error) });
    return;
  }

  const parsed = BookingRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    });
    return;
  }
  const request = parsed.data;

  const legs: BookingConfirmation["legs"] = [];
  for (const leg of request.legs) {
    const offer = findOfferById(leg.offerId);
    if (!offer) {
      res.status(404).json({ error: `Unknown offerId: ${leg.offerId}` });
      return;
    }
    legs.push({
      offerId: offer.offerId,
      departUtc: offer.departUtc,
      priceMinor: offer.priceMinor,
      currency: offer.currency,
    });
  }

  let stay: BookingConfirmation["stay"];
  if (request.stay) {
    const property = findStayById(request.stay.hotelId);
    if (!property) {
      res
        .status(404)
        .json({ error: `Unknown hotelId: ${request.stay.hotelId}` });
      return;
    }
    let priced;
    try {
      priced = priceStay(property, request.stay.checkIn, request.stay.checkOut);
    } catch (error) {
      res.status(400).json({
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    stay = {
      hotelId: property.hotelId,
      checkInUtc: localTimeToUtc(request.stay.checkIn, "15:00", property.city),
      checkOutUtc: localTimeToUtc(
        request.stay.checkOut,
        "11:00",
        property.city,
      ),
      priceMinor: priced.priceMinor,
      currency: property.currency,
    };
  }

  const activities: BookingConfirmation["activities"] = [];
  for (const wanted of request.activities) {
    const activity = findActivityById(wanted.activityId);
    if (!activity) {
      res
        .status(404)
        .json({ error: `Unknown activityId: ${wanted.activityId}` });
      return;
    }
    // A slot the catalogue does not offer would otherwise yield a signed
    // confirmation for something that does not exist.
    if (!runsAt(activity, wanted.startUtc)) {
      res.status(400).json({
        error: `${activity.activityId} does not run at ${wanted.startUtc} (offered: ${activity.startTimes.join(", ")} local)`,
      });
      return;
    }
    activities.push({
      activityId: activity.activityId,
      startUtc: wanted.startUtc,
      priceMinor: activity.priceMinor,
      currency: activity.currency,
    });
  }

  const components = [...legs, ...(stay ? [stay] : []), ...activities];
  const currencies = new Set(components.map((component) => component.currency));
  if (currencies.size > 1) {
    // Summing across currencies would need a rate, and a wrong rate here is a
    // wrong total on a signed confirmation — and a wrong amount on a card.
    res.status(400).json({
      error: `Itinerary mixes currencies: ${[...currencies].join(", ")}`,
    });
    return;
  }

  const totalMinor = components.reduce(
    (total, component) => total + component.priceMinor,
    0,
  );
  const currency = [...currencies][0] ?? "USD";
  const bookingId = randomUUID();
  const confirmationCode = bookingId.slice(0, 8).toUpperCase();
  const issuedAt = new Date().toISOString();

  const confirmed: BookingConfirmation = {
    legs,
    ...(stay ? { stay } : {}),
    activities,
    totalMinor,
    currency,
    fareCharged: {
      amountMinor: totalMinor,
      currency,
      brand: request.payment.brand,
      last4: request.payment.last4,
      authCode: simulatedAuthCode(bookingId, request.payment.token),
      // Never absent, never false. A reader should not have to infer that no
      // money moved through a card network here.
      simulated: true,
    },
  };

  // ALWAYS "CONFIRMED_SIMULATED" — never a real reservation, and the card
  // authorisation above is simulated too.
  //
  // The signature covers the resolved itinerary AND what was charged for it. A
  // signature over a booking id alone attests that something was booked, not
  // what, and not for how much.
  const signature = signPayload({
    bookingId,
    confirmationCode,
    status: "CONFIRMED_SIMULATED",
    issuedAt,
    passengerName: request.passengerName,
    passengerEmail: request.passengerEmail,
    confirmed,
  });

  const body: BookingResponse = {
    bookingId,
    status: "CONFIRMED_SIMULATED",
    confirmationCode,
    signature,
    issuedAt,
    confirmed,
  };
  res.status(200).json(body);
});

/**
 * A stable, meaningless authorisation reference.
 *
 * Derived from the booking id and the test token so the same booking always
 * shows the same code, which makes a confirmation reproducible in a demo.
 * It is not an acquirer response and nothing should treat it as one.
 */
function simulatedAuthCode(bookingId: string, token: string): string {
  return `SIM-${createHash("sha256").update(`${bookingId}:${token}`).digest("hex").slice(0, 8).toUpperCase()}`;
}
