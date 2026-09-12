import { clampTinybar, hbarToTinybar } from "./tinybar.js";

/**
 * Metered pricing, deliberately kept out of config.ts.
 *
 * config.ts hard-requires PAY_TO and SUPPLIER_SIGNING_KEY at import time — the
 * supplier genuinely cannot take payment without them. But pricing is pure
 * arithmetic over env vars that all have defaults, and tying it to those
 * credentials would mean the price of a search could not be tested, or even
 * read, without a funded account.
 */

/** A metered search's price band: per-result rate, floor and cap, all in HBAR. */
export interface PriceBand {
  perResultHbar: string;
  minHbar: string;
  maxHbar: string;
}

/**
 * One band per domain, because the rows are not worth the same. A flight row is
 * a whole itinerary leg; an activity row is one start time for one experience,
 * and a single day in one city yields dozens of them. Charging them alike would
 * either make activity searches absurd or make flight searches free.
 *
 * The cap matters as much as the rate: an unfiltered "show me everything"
 * search legitimately costs the maximum, and the cap is what stops it costing
 * more than the trip.
 */
export const PRICE_BANDS = {
  flights: {
    perResultHbar: process.env["SEARCH_PRICE_PER_RESULT_HBAR"] ?? "0.05",
    minHbar: process.env["SEARCH_PRICE_MIN_HBAR"] ?? "0.10",
    maxHbar: process.env["SEARCH_PRICE_MAX_HBAR"] ?? "2.50",
  },
  stays: {
    perResultHbar: process.env["STAY_PRICE_PER_RESULT_HBAR"] ?? "0.04",
    minHbar: process.env["STAY_PRICE_MIN_HBAR"] ?? "0.10",
    maxHbar: process.env["STAY_PRICE_MAX_HBAR"] ?? "2.00",
  },
  activities: {
    perResultHbar: process.env["ACTIVITY_PRICE_PER_RESULT_HBAR"] ?? "0.02",
    minHbar: process.env["ACTIVITY_PRICE_MIN_HBAR"] ?? "0.05",
    maxHbar: process.env["ACTIVITY_PRICE_MAX_HBAR"] ?? "1.00",
  },
} as const satisfies Record<string, PriceBand>;

export type PriceBandName = keyof typeof PRICE_BANDS;

/** clamp(resultCount * perResult, min, max) for one domain's band, in tinybars. */
export function priceTinybars(
  band: PriceBandName,
  resultCount: number,
): bigint {
  const { perResultHbar, minHbar, maxHbar } = PRICE_BANDS[band];
  const raw = hbarToTinybar(perResultHbar) * BigInt(Math.max(resultCount, 0));
  return clampTinybar(raw, minHbar, maxHbar);
}

/** Human-readable pricing for the agent card, one label per band. */
export function pricingLabel(band: PriceBandName): string {
  const { perResultHbar, minHbar, maxHbar } = PRICE_BANDS[band];
  return `clamp(count x ${perResultHbar}, ${minHbar}, ${maxHbar}) HBAR`;
}

/**
 * How long a quote stays valid: shorter before payment, longer once paid, so a
 * buyer who has paid has room to use what they bought without the rows moving
 * underneath them.
 */
export const QUOTE_TTL_UNPAID_SECONDS = process.env["QUOTE_TTL_UNPAID_SECONDS"]
  ? Number(process.env["QUOTE_TTL_UNPAID_SECONDS"])
  : 300;
export const QUOTE_TTL_PAID_SECONDS = process.env["QUOTE_TTL_PAID_SECONDS"]
  ? Number(process.env["QUOTE_TTL_PAID_SECONDS"])
  : 900;

const BOOKING_FEE_HBAR = process.env["BOOKING_FEE_HBAR"] ?? "1.00";

/** Flat booking fee, in tinybars. */
export function bookingFeeTinybars(): bigint {
  return hbarToTinybar(BOOKING_FEE_HBAR);
}

export const bookingPricingLabel = `flat ${BOOKING_FEE_HBAR} HBAR`;
