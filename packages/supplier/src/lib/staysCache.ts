import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Stay, StayOffer } from "@sh/contracts";
import { hashSeed } from "./seededPrice.js";
import { UTC_OFFSET_HOURS } from "./airports.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.resolve(
  __dirname,
  "../../../../data/cache/hotels.json",
);

let cached: Stay[] | null = null;

/**
 * Reads the generator's catalogue — see scripts/generate-stays.ts.
 *
 * Held in memory after the first read: a paid request should not pay a disk
 * read, and the file only changes when the offline job reruns.
 */
export function loadCachedStays(): Stay[] {
  if (cached) return cached;
  try {
    cached = JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as Stay[];
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Stay cache unreadable at ${CACHE_PATH} — run \`npm run stays:generate\`. (${reason})`,
    );
  }
  return cached;
}

export function clearStaysCache(): void {
  cached = null;
}

export interface StayQuery {
  city: string;
  /** YYYY-MM-DD, local. */
  checkIn: string;
  /** YYYY-MM-DD, local. Must be after checkIn. */
  checkOut: string;
  guests?: number;
  minStars?: number;
  /** Filter on the total stay price, not the nightly rate. */
  maxTotalMinor?: number;
}

/**
 * Nightly rate for one property on one date.
 *
 * Derived purely from the hotel id and the date, with no stored state and no
 * run-time seed, so the same night always costs the same — a quote a buyer
 * paid for stays valid if they ask again.
 */
export function nightlyRate(stay: Stay, dateIso: string): number {
  const rand = mulberry32(hashSeed(`${stay.hotelId}:${dateIso}`));

  const weekday = new Date(`${dateIso}T00:00:00.000Z`).getUTCDay();
  // Friday and Saturday nights carry the weekend premium; Sunday does not.
  const weekend = weekday === 5 || weekday === 6 ? 1.22 : 1;

  // A gentle seasonal swing across the year rather than per-night noise, so
  // consecutive nights in one stay stay believable.
  const dayOfYear = Math.floor(
    (Date.parse(`${dateIso}T00:00:00.000Z`) -
      Date.parse(`${dateIso.slice(0, 4)}-01-01T00:00:00.000Z`)) /
      86_400_000,
  );
  const season = 1 + 0.12 * Math.sin((dayOfYear / 365) * Math.PI * 2);

  const jitter = 0.94 + rand() * 0.14;
  return (
    Math.round((stay.baseNightlyPriceMinor * weekend * season * jitter) / 100) *
    100
  );
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function nightsBetween(checkIn: string, checkOut: string): string[] {
  const start = Date.parse(`${checkIn}T00:00:00.000Z`);
  const end = Date.parse(`${checkOut}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new TypeError(
      `searchStays: dates must be YYYY-MM-DD, got "${checkIn}" and "${checkOut}"`,
    );
  }
  if (end <= start) {
    throw new RangeError(
      `searchStays: checkOut (${checkOut}) must be after checkIn (${checkIn})`,
    );
  }
  const nights: string[] = [];
  for (let t = start; t < end; t += 86_400_000) {
    nights.push(new Date(t).toISOString().slice(0, 10));
  }
  return nights;
}

/**
 * Prices the catalogue for one stay.
 *
 * The returned row COUNT is what the supplier prices the search on, so this
 * runs before the x402 challenge is built — the buyer is quoted for the rows
 * they will actually get.
 */
export function searchStays(query: StayQuery): StayOffer[] {
  const city = query.city.toUpperCase();
  const nights = nightsBetween(query.checkIn, query.checkOut);

  const matches = loadCachedStays().filter((stay) => {
    if (stay.city !== city) return false;
    if (query.guests !== undefined && stay.maxGuests < query.guests)
      return false;
    if (query.minStars !== undefined && stay.starRating < query.minStars)
      return false;
    return true;
  });

  // A city we hold no inventory for is an empty result, not an error. Resolving
  // its timezone first would turn it into one.
  if (matches.length === 0) return [];

  // Check-in and check-out are local clock times at the property: 15:00 and
  // 11:00 are the near-universal defaults.
  const checkInUtc = localTimeToUtc(query.checkIn, "15:00", city);
  const checkOutUtc = localTimeToUtc(query.checkOut, "11:00", city);

  return matches
    .map((stay) => {
      const priceMinor = nights.reduce(
        (total, date) => total + nightlyRate(stay, date),
        0,
      );
      const offer: StayOffer = {
        hotelId: stay.hotelId,
        checkInUtc,
        checkOutUtc,
        priceMinor,
        currency: stay.currency,
        name: stay.name,
        city: stay.city,
        area: stay.area,
        starRating: stay.starRating,
        roomType: stay.roomType,
        nights: nights.length,
        nightlyPriceMinor: Math.round(priceMinor / nights.length),
        refundable: stay.refundable,
        amenities: stay.amenities,
      };
      return offer;
    })
    .filter(
      (offer) =>
        query.maxTotalMinor === undefined ||
        offer.priceMinor <= query.maxTotalMinor,
    )
    .sort(
      (a, b) =>
        a.priceMinor - b.priceMinor || a.hotelId.localeCompare(b.hotelId),
    );
}

/** Local wall-clock at a city -> UTC instant, using the shared airport table. */
export function localTimeToUtc(
  dateIso: string,
  hhmm: string,
  city: string,
): string {
  const [hour, minute] = hhmm.split(":").map(Number);
  const midnight = Date.parse(`${dateIso}T00:00:00.000Z`);
  if (Number.isNaN(midnight))
    throw new TypeError(`localTimeToUtc: invalid date "${dateIso}"`);

  const offsetHours = UTC_OFFSET_HOURS[city.toUpperCase()];
  if (offsetHours === undefined) {
    // Silently treating an unknown city as UTC would shift every check-in by
    // hours without anyone noticing.
    throw new Error(
      `No UTC offset for "${city}". Add it to UTC_OFFSET_HOURS in src/lib/airports.ts.`,
    );
  }

  return new Date(
    midnight + ((hour ?? 0) - offsetHours) * 3_600_000 + (minute ?? 0) * 60_000,
  ).toISOString();
}

/** One property by id, or undefined. Booking resolves prices from here, never from the client. */
export function findStayById(hotelId: string): Stay | undefined {
  return loadCachedStays().find((stay) => stay.hotelId === hotelId);
}

/**
 * Total for one property across a date range, using the same per-night rates a
 * search would have quoted — so a price a buyer saw is the price they are booked at.
 */
export function priceStay(
  stay: Stay,
  checkIn: string,
  checkOut: string,
): { priceMinor: number; nights: number } {
  const nights = nightsBetween(checkIn, checkOut);
  return {
    priceMinor: nights.reduce(
      (total, date) => total + nightlyRate(stay, date),
      0,
    ),
    nights: nights.length,
  };
}
