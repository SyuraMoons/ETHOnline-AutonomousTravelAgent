import { itineraryHash } from "@sh/contracts";
import type { FlightOption, FlightOptionBadge, SearchResult } from "@sh/contracts";

/**
 * Turns real, paid-for SearchResult[] legs from packages/supplier into ranked
 * FlightOption[] — the badge/rank logic ported from the deleted fake
 * generator (services/autovoyage/flightOptions.ts). Only the source of the
 * legs changed: prices and itineraryHash are now real.
 */

type RawOption = Omit<FlightOption, "itineraryHash" | "badges">;

function legDurationMinutes(leg: SearchResult): number {
  return Math.round((new Date(leg.arriveUtc).getTime() - new Date(leg.departUtc).getTime()) / 60_000);
}

/**
 * Pairs outbound and inbound legs rank-for-rank (index i with index i) into
 * FlightOption rows, ranked best-first. `inboundLegs` is empty for a one-way
 * trip. cabin defaults to "Economy" — the supplier doesn't model cabin class.
 */
export function buildOptionsFromLegs(params: {
  outboundLegs: SearchResult[];
  inboundLegs: SearchResult[];
  paxCount: number;
  cabin?: string;
}): FlightOption[] {
  const { outboundLegs, inboundLegs, paxCount, cabin = "Economy" } = params;
  const isRoundTrip = inboundLegs.length > 0;
  const count = isRoundTrip ? Math.min(outboundLegs.length, inboundLegs.length) : outboundLegs.length;

  const raw: RawOption[] = Array.from({ length: count }, (_, i) => {
    const outbound = outboundLegs[i];
    const legs = isRoundTrip ? [outbound, inboundLegs[i]] : [outbound];
    const perPaxMinor = legs.reduce((sum, leg) => sum + leg.priceMinor, 0);
    const durationMinutes = legs.reduce((sum, leg) => sum + legDurationMinutes(leg), 0);
    const stops = 0; // supplier's search results are direct legs only

    return {
      optionId: crypto.randomUUID(),
      legs,
      perPaxMinor,
      totalMinor: perPaxMinor * paxCount,
      currency: outbound.currency,
      cabin,
      stops,
      durationMinutes,
    };
  });

  if (raw.length === 0) return [];

  const cheapestId = raw.reduce((a, b) => (b.totalMinor < a.totalMinor ? b : a)).optionId;
  const fastestId = raw.reduce((a, b) => (b.durationMinutes < a.durationMinutes ? b : a)).optionId;

  // Guarded against a zero-priced or zero-duration supplier row (e.g. departUtc === arriveUtc):
  // dividing by an actual 0 here would make every score Infinity/NaN, so the "best" ranking
  // would become arbitrary rather than reflecting real cost/time.
  const minFare = Math.max(Math.min(...raw.map(o => o.totalMinor)), 1);
  const minTime = Math.max(Math.min(...raw.map(o => o.durationMinutes)), 1);
  const score = (o: RawOption) => o.totalMinor / minFare + o.durationMinutes / minTime;
  const bestId = raw.reduce((a, b) => (score(b) < score(a) ? b : a)).optionId;

  const ranked = [...raw].sort((a, b) => score(a) - score(b));

  return ranked.map(option => {
    const badges: FlightOptionBadge[] = [];
    if (option.optionId === bestId) badges.push("best");
    if (option.optionId === cheapestId) badges.push("cheapest");
    if (option.optionId === fastestId && option.optionId !== bestId) badges.push("fastest");

    return {
      ...option,
      badges,
      itineraryHash: itineraryHash({
        planId: option.optionId,
        legs: option.legs,
        paxCount,
        fareTotalMinor: option.totalMinor,
        currency: option.currency,
        refusals: [],
        createdAt: new Date().toISOString(),
      }),
    };
  });
}
