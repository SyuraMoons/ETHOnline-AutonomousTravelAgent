// Routes and dates in scope. Config, not inline constants, so widening the job
// never means touching adapter code.

export type Cabin = "economy" | "business";

export interface RouteQuery {
  origin: string;
  destination: string;
  /** YYYY-MM-DD, local to the origin airport. */
  date: string;
  cabin: Cabin;
  pax: number;
}

export const ROUTES: ReadonlyArray<readonly [string, string]> = [
  ["CGK", "SIN"],
  ["SIN", "CGK"],
  ["CGK", "DPS"],
  ["DPS", "CGK"],
  ["CGK", "KUL"],
  ["SIN", "BKK"],
];

export const DATES: readonly string[] = ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];

export const CABINS: readonly Cabin[] = ["economy", "business"];

export const DEFAULT_PAX = 1;

/**
 * IATA -> IANA timezone. Hardcoded rather than pulled from a dependency: this
 * is a closed set that changes roughly never, and the alternative is shipping a
 * timezone database to resolve six airports.
 *
 * Getting this wrong produces negative durations, which normalize.ts asserts
 * against — a wrong zone fails loudly rather than writing a corrupt row.
 */
export const AIRPORT_TZ: Readonly<Record<string, string>> = {
  CGK: "Asia/Jakarta",
  DPS: "Asia/Makassar",
  SIN: "Asia/Singapore",
  KUL: "Asia/Kuala_Lumpur",
  BKK: "Asia/Bangkok",
};

/**
 * IATA -> ISO 3166-1 alpha-2. Some sites need the country alongside the airport
 * code to resolve it unambiguously; without it Booking.com silently falls back
 * to an unrelated destination rather than erroring.
 */
export const AIRPORT_COUNTRY: Readonly<Record<string, string>> = {
  CGK: "ID",
  DPS: "ID",
  SIN: "SG",
  KUL: "MY",
  BKK: "TH",
};

/** Display names some sites require alongside the code to resolve a location. */
export const AIRPORT_NAME: Readonly<Record<string, string>> = {
  CGK: "Soekarno-Hatta International Airport",
  DPS: "Ngurah Rai International Airport",
  SIN: "Changi Airport",
  KUL: "Kuala Lumpur International Airport",
  BKK: "Suvarnabhumi Airport",
};

export const CITY_NAME: Readonly<Record<string, string>> = {
  CGK: "Jakarta",
  DPS: "Denpasar",
  SIN: "Singapore",
  KUL: "Kuala Lumpur",
  BKK: "Bangkok",
};

export function airportNameFor(iata: string): string {
  return AIRPORT_NAME[iata.toUpperCase()] ?? iata.toUpperCase();
}

export function cityNameFor(iata: string): string {
  return CITY_NAME[iata.toUpperCase()] ?? iata.toUpperCase();
}

export function countryFor(iata: string): string {
  const country = AIRPORT_COUNTRY[iata.toUpperCase()];
  if (!country) {
    throw new Error(`No country mapped for airport "${iata}". Add it to AIRPORT_COUNTRY in src/routes.config.ts.`);
  }
  return country;
}

export function timezoneFor(iata: string): string {
  const tz = AIRPORT_TZ[iata.toUpperCase()];
  if (!tz) {
    throw new Error(`No timezone mapped for airport "${iata}". Add it to AIRPORT_TZ in src/routes.config.ts.`);
  }
  return tz;
}

/** Expands --all into the full job list. */
export function allQueries(pax = DEFAULT_PAX): RouteQuery[] {
  const queries: RouteQuery[] = [];
  for (const [origin, destination] of ROUTES) {
    for (const date of DATES) {
      for (const cabin of CABINS) {
        queries.push({ origin, destination, date, cabin, pax });
      }
    }
  }
  return queries;
}

export function parseRoute(route: string): { origin: string; destination: string } {
  const match = /^([A-Za-z]{3})-([A-Za-z]{3})$/.exec(route.trim());
  if (!match) {
    throw new Error(`--route must look like "CGK-SIN", got "${route}"`);
  }
  return { origin: match[1]!.toUpperCase(), destination: match[2]!.toUpperCase() };
}

export function routeKey(q: RouteQuery): string {
  return `${q.origin}-${q.destination}`;
}
