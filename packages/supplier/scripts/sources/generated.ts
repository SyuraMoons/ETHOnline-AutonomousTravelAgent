import type { SearchResult } from "@sh/contracts";
import { UTC_OFFSET_HOURS } from "../../src/lib/airports.js";
import type { FlightSource } from "./types.js";

/**
 * Deterministic synthetic flight rows.
 *
 * Given the same seed and start date this emits byte-identical output, so
 * regenerating is a no-op in git unless something actually changed.
 *
 * Row counts per (origin, destination, date) are deliberately uneven, because
 * the supplier prices a search as clamp(rowCount * 0.05, 0.10, 2.50) HBAR —
 * if every query returned the same number of rows, every query would cost the
 * same and the metering would look fake. Frequencies here put most searches in
 * the 0.10–0.60 HBAR band with busy routes reaching further up.
 */

interface Route {
  origin: string;
  destination: string;
  airlines: string[];
  /** Scheduled block time in minutes. */
  durationMinutes: number;
  /** Typical one-way fare, in minor units of `currency`. */
  basePriceMinor: number;
  /** Flights per day, before per-day jitter. */
  dailyFlights: number;
}

const AIRLINE_CODES: Record<string, string> = {
  "Singapore Airlines": "SQ",
  "Garuda Indonesia": "GA",
  "Japan Airlines": "JL",
  ANA: "NH",
  Scoot: "TR",
  "Jetstar Asia": "3K",
  "Cathay Pacific": "CX",
  "Thai Airways": "TG",
  "Malaysia Airlines": "MH",
  AirAsia: "AK",
  "Lion Air": "JT",
  Citilink: "QG",
  "Batik Air": "ID",
  Qantas: "QF",
};

const ROUTES: Route[] = [
  {
    origin: "CGK",
    destination: "DPS",
    airlines: [
      "Garuda Indonesia",
      "Lion Air",
      "Citilink",
      "Batik Air",
      "AirAsia",
    ],
    durationMinutes: 110,
    basePriceMinor: 8900,
    dailyFlights: 11,
  },
  {
    origin: "SIN",
    destination: "CGK",
    airlines: [
      "Singapore Airlines",
      "Garuda Indonesia",
      "Scoot",
      "Jetstar Asia",
    ],
    durationMinutes: 105,
    basePriceMinor: 14500,
    dailyFlights: 8,
  },
  {
    origin: "SIN",
    destination: "KUL",
    airlines: ["Malaysia Airlines", "Singapore Airlines", "AirAsia", "Scoot"],
    durationMinutes: 65,
    basePriceMinor: 9800,
    dailyFlights: 9,
  },
  {
    origin: "SIN",
    destination: "BKK",
    airlines: ["Thai Airways", "Singapore Airlines", "Scoot", "Jetstar Asia"],
    durationMinutes: 145,
    basePriceMinor: 16200,
    dailyFlights: 6,
  },
  {
    origin: "SIN",
    destination: "HKG",
    airlines: ["Cathay Pacific", "Singapore Airlines", "Scoot"],
    durationMinutes: 235,
    basePriceMinor: 24800,
    dailyFlights: 5,
  },
  {
    origin: "SIN",
    destination: "DPS",
    airlines: [
      "Singapore Airlines",
      "Garuda Indonesia",
      "Scoot",
      "Jetstar Asia",
    ],
    durationMinutes: 165,
    basePriceMinor: 13400,
    dailyFlights: 5,
  },
  {
    origin: "SIN",
    destination: "NRT",
    airlines: ["ANA", "Japan Airlines", "Singapore Airlines", "Scoot"],
    durationMinutes: 425,
    basePriceMinor: 42500,
    dailyFlights: 4,
  },
  {
    origin: "CGK",
    destination: "HND",
    airlines: ["Garuda Indonesia", "ANA", "Japan Airlines"],
    durationMinutes: 445,
    basePriceMinor: 48900,
    dailyFlights: 3,
  },
  {
    origin: "SIN",
    destination: "SYD",
    airlines: ["Qantas", "Singapore Airlines", "Scoot"],
    durationMinutes: 470,
    basePriceMinor: 51200,
    dailyFlights: 3,
  },
  {
    origin: "DPS",
    destination: "SYD",
    airlines: ["Qantas", "Garuda Indonesia", "Jetstar Asia"],
    durationMinutes: 365,
    basePriceMinor: 38700,
    dailyFlights: 2,
  },
];

const CURRENCY = "USD";
const DAYS = 14;

/** mulberry32 — small, fast, and stable across engines and Node versions. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a, so each route-day gets its own independent, order-independent stream. */
function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function pick<T>(rand: () => number, items: T[]): T {
  return items[Math.floor(rand() * items.length)]!;
}

function intBetween(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/** Local wall-clock departure -> UTC instant. */
function departureUtc(
  dateIso: string,
  localHour: number,
  localMinute: number,
  airport: string,
): Date {
  const offset = UTC_OFFSET_HOURS[airport] ?? 0;
  const midnightUtc = new Date(`${dateIso}T00:00:00.000Z`).getTime();
  return new Date(
    midnightUtc + (localHour - offset) * 3_600_000 + localMinute * 60_000,
  );
}

function buildDay(
  route: Route,
  dateIso: string,
  seedSalt: number,
): SearchResult[] {
  const key = `${route.origin}-${route.destination}-${dateIso}`;
  const rand = mulberry32(hashSeed(key) ^ seedSalt);

  // Uneven daily frequency, so row counts (and therefore search prices) vary.
  const count = Math.max(2, route.dailyFlights + intBetween(rand, -2, 2));

  // Weekend departures cost more.
  const weekday = new Date(`${dateIso}T00:00:00.000Z`).getUTCDay();
  const weekendMultiplier = weekday === 0 || weekday === 6 ? 1.18 : 1;

  const rows: SearchResult[] = [];
  for (let i = 0; i < count; i += 1) {
    // Spread departures across the operating day, 05:00–22:00 local.
    const localHour = 5 + Math.floor((i / count) * 17) + intBetween(rand, 0, 1);
    const localMinute = pick(
      rand,
      [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55],
    );
    const depart = departureUtc(
      dateIso,
      Math.min(localHour, 22),
      localMinute,
      route.origin,
    );
    const arrive = new Date(depart.getTime() + route.durationMinutes * 60_000);

    // Red-eyes and very early departures are cheaper; peak morning costs more.
    const hourMultiplier =
      localHour <= 6
        ? 0.86
        : localHour >= 20
          ? 0.91
          : localHour >= 8 && localHour <= 11
            ? 1.12
            : 1;
    const jitter = 0.85 + rand() * 0.34;
    const priceMinor =
      Math.round(
        (route.basePriceMinor * weekendMultiplier * hourMultiplier * jitter) /
          100,
      ) * 100;

    const airline = pick(rand, route.airlines);
    const code = AIRLINE_CODES[airline] ?? "XX";

    rows.push({
      // Deterministic and unique: same inputs always produce this same id, so
      // an offerId stays valid across regenerations of an unchanged dataset.
      offerId: `flt_${route.origin.toLowerCase()}${route.destination.toLowerCase()}_${dateIso.replace(/-/g, "")}_${String(i + 1).padStart(2, "0")}`,
      origin: route.origin,
      destination: route.destination,
      departUtc: depart.toISOString(),
      arriveUtc: arrive.toISOString(),
      airline,
      flightNumber: `${code}${intBetween(rand, 100, 999)}`,
      priceMinor,
      currency: CURRENCY,
      seatsAvailable: intBetween(rand, 1, 9),
    });
  }
  return rows;
}

export interface GeneratedSourceOptions {
  /** Any integer. Changing it reshuffles every price, time and airline. */
  seed: number;
  /** First departure date, YYYY-MM-DD. Defaults to today (UTC) in the driver. */
  startDate: string;
}

export function generatedSource({
  seed,
  startDate,
}: GeneratedSourceOptions): FlightSource {
  return {
    id: "generated",
    description: `deterministic synthetic data — ${ROUTES.length} routes x 2 directions x ${DAYS} days from ${startDate}, seed ${seed}`,
    async fetch(): Promise<SearchResult[]> {
      const start = new Date(`${startDate}T00:00:00.000Z`);
      if (Number.isNaN(start.getTime())) {
        throw new Error(
          `generated source: startDate is not a valid YYYY-MM-DD date: ${startDate}`,
        );
      }

      const rows: SearchResult[] = [];
      for (let day = 0; day < DAYS; day += 1) {
        const dateIso = new Date(start.getTime() + day * 86_400_000)
          .toISOString()
          .slice(0, 10);
        for (const route of ROUTES) {
          rows.push(...buildDay(route, dateIso, seed));
          // Both directions, so a round trip can be planned from this dataset.
          const ret: Route = {
            ...route,
            origin: route.destination,
            destination: route.origin,
          };
          rows.push(...buildDay(ret, dateIso, seed));
        }
      }
      return rows;
    },
  };
}
