import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  BookingRequest,
  type BookingConfirmation,
  type BookingResponse,
} from "@sh/contracts";
import { registerRoute, withPayment } from "../services/x402/server.js";
import { bookingFeeTinybars, HBAR_ASSET } from "../config.js";
import { findOfferById } from "../lib/inventory.js";
import { findStayById, localTimeToUtc, priceStay } from "../lib/staysCache.js";
import { findActivityById, runsAt } from "../lib/activitiesCache.js";
import { signPayload } from "../lib/signing.js";

export const bookingRouter = Router();

// Flat BOOKING_FEE_HBAR (default 1.00 HBAR) regardless of what the itinerary
// contains — the fee is for the booking action, not the fare. Fares are quoted
// in fiat minor units by the searches; the HBAR service fee is a separate thing.
registerRoute("POST /v1/booking", () => ({
  asset: HBAR_ASSET,
  amount: bookingFeeTinybars().toString(),
}));

/**
 * Books one whole itinerary: flights, and optionally a stay and some activities.
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
bookingRouter.post(
  "/v1/booking",
  withPayment(async (req) => {
    const parsed = BookingRequest.safeParse(req.body);
    if (!parsed.success) {
      return {
        error: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        status: 400,
      };
    }
    const request = parsed.data;

    const legs: BookingConfirmation["legs"] = [];
    for (const leg of request.legs) {
      const offer = findOfferById(leg.offerId);
      if (!offer)
        return { error: `Unknown offerId: ${leg.offerId}`, status: 404 };
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
      if (!property)
        return {
          error: `Unknown hotelId: ${request.stay.hotelId}`,
          status: 404,
        };
      let priced;
      try {
        priced = priceStay(
          property,
          request.stay.checkIn,
          request.stay.checkOut,
        );
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
          status: 400,
        };
      }
      stay = {
        hotelId: property.hotelId,
        checkInUtc: localTimeToUtc(
          request.stay.checkIn,
          "15:00",
          property.city,
        ),
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
      if (!activity)
        return {
          error: `Unknown activityId: ${wanted.activityId}`,
          status: 404,
        };
      // A slot the catalogue does not offer would otherwise yield a signed
      // confirmation for something that does not exist.
      if (!runsAt(activity, wanted.startUtc)) {
        return {
          error: `${activity.activityId} does not run at ${wanted.startUtc} (offered: ${activity.startTimes.join(", ")} local)`,
          status: 400,
        };
      }
      activities.push({
        activityId: activity.activityId,
        startUtc: wanted.startUtc,
        priceMinor: activity.priceMinor,
        currency: activity.currency,
      });
    }

    const components = [...legs, ...(stay ? [stay] : []), ...activities];
    const currencies = new Set(
      components.map((component) => component.currency),
    );
    if (currencies.size > 1) {
      // Summing across currencies would need a rate, and a wrong rate here is a
      // wrong total on a signed confirmation.
      return {
        error: `Itinerary mixes currencies: ${[...currencies].join(", ")}`,
        status: 400,
      };
    }

    const confirmed: BookingConfirmation = {
      legs,
      ...(stay ? { stay } : {}),
      activities,
      totalMinor: components.reduce(
        (total, component) => total + component.priceMinor,
        0,
      ),
      currency: [...currencies][0] ?? "USD",
    };

    const bookingId = randomUUID();
    const confirmationCode = bookingId.slice(0, 8).toUpperCase();
    const issuedAt = new Date().toISOString();

    // ALWAYS "CONFIRMED_SIMULATED" — never a real reservation.
    // The signature covers the resolved itinerary, not just its id: a signature
    // over a booking id alone attests that something was booked, not what.
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
    return { body };
  }),
);
