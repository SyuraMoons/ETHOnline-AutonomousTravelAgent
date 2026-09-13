import type { ActivityOffer, DossierStay, PlanActivity, StayOffer } from "@sh/contracts";

/**
 * The boundary between what the model claims and what a card gets charged for.
 *
 * Kept in its own module, free of any server-only import, because these two functions are the
 * guardrail rather than a detail of the run loop — they have to be directly testable.
 */

/**
 * Resolves the stay and activities the model named in finalize against what was actually
 * PAID for.
 *
 * A model-supplied id is never trusted: an invented hotelId resolves to nothing and the trip
 * goes out without a hotel, rather than onto a card charge and a signed confirmation for a
 * room that does not exist. Same rule as resolveChosenOption() — and the supplier would reject
 * it anyway, but it must not get that far, because by then a human has approved the hash.
 */
export function resolveStay(
  offers: StayOffer[],
  dates: { checkIn: string; checkOut: string } | null,
  hotelId: string | null,
): DossierStay | undefined {
  if (!hotelId || !dates) return undefined;
  const offer = offers.find(o => o.hotelId === hotelId);
  if (!offer) return undefined;
  return {
    hotelId: offer.hotelId,
    checkInUtc: offer.checkInUtc,
    checkOutUtc: offer.checkOutUtc,
    priceMinor: offer.priceMinor,
    currency: offer.currency,
    checkIn: dates.checkIn,
    checkOut: dates.checkOut,
  };
}

export function resolveActivities(offers: ActivityOffer[], ids: string[]): PlanActivity[] {
  // Deduplicated: the same slot named twice would be charged twice and hashed as two items.
  const wanted = new Set(ids);
  return offers
    .filter(o => wanted.has(o.activityId))
    .map(o => ({
      activityId: o.activityId,
      startUtc: o.startUtc,
      priceMinor: o.priceMinor,
      currency: o.currency,
    }));
}
