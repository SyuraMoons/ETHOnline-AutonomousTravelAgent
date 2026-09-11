// Raw adapter output -> validated FlightRow.
//
// One place, so a new adapter never reimplements the output contract. Invalid
// rows are DROPPED with a warning naming the offending field — never coerced.
// A silently coerced row is worse than a missing one: it looks like data.

import { z } from "zod";
import { log } from "./log.js";
import { timezoneFor, type RouteQuery } from "./routes.config.js";

export const FlightRow = z.object({
  id: z.string(),
  carrier: z.string().length(2),
  carrierName: z.string(),
  flightNumber: z.string(),
  origin: z.string().length(3),
  destination: z.string().length(3),
  departUtc: z.string().datetime(),
  arriveUtc: z.string().datetime(),
  durationMinutes: z.number().int().positive(),
  stops: z.number().int().min(0),
  cabin: z.enum(["economy", "business"]),
  priceMinor: z.number().int().positive(),
  currency: z.string().length(3),
  refundable: z.boolean(),
  baggageKg: z.number().int().min(0),
  fareBasis: z.string(),
  _meta: z.object({
    source: z.string(),
    scrapedAt: z.string().datetime(),
    sourceUrl: z.string().url(),
    /** True when any field below fell back to a default the site did not expose. */
    partial: z.boolean().optional(),
  }),
});
export type FlightRow = z.infer<typeof FlightRow>;

/**
 * Documented defaults for fields a flight-search response usually omits.
 * A row using any of these is tagged `_meta.partial`, so a consumer can tell
 * "economy, no checked bag" from "we did not find out".
 */
export const DEFAULTS = {
  refundable: false,
  baggageKg: 0,
  fareBasis: "UNKNOWN",
} as const;

/** Fields an adapter is expected to produce before normalisation. */
export interface RawFlight {
  carrier?: string | null;
  carrierName?: string | null;
  flightNumber?: string | null;
  /** Local wall-clock at the ORIGIN airport, "YYYY-MM-DDTHH:mm" or "HH:mm". */
  departLocal?: string | null;
  /** Local wall-clock at the DESTINATION airport. */
  arriveLocal?: string | null;
  durationMinutes?: number | null;
  stops?: number | null;
  priceMinor?: number | null;
  currency?: string | null;
  refundable?: boolean | null;
  baggageKg?: number | null;
  fareBasis?: string | null;
}

/**
 * Local wall-clock time in an IANA zone -> UTC instant.
 *
 * Uses Intl rather than a timezone dependency: format the candidate instant in
 * the target zone, measure how far off it landed, and correct. Two passes
 * settle it even across a DST boundary.
 */
function localToUtc(localIso: string, timeZone: string): Date {
  const naive = new Date(`${localIso}Z`);
  if (Number.isNaN(naive.getTime())) {
    throw new Error(`unparseable local time "${localIso}"`);
  }

  let guess = naive;
  for (let pass = 0; pass < 2; pass += 1) {
    const offsetMs = zoneOffsetMs(guess, timeZone);
    guess = new Date(naive.getTime() - offsetMs);
  }
  return guess;
}

/** How far ahead of UTC `timeZone` is at `instant`. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const get = (type: string): string => parts.find(p => p.type === type)?.value ?? "00";
  const asUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")) % 24,
    Number(get("minute")),
    Number(get("second")),
  );
  return asUtc - instant.getTime();
}

/** Completes a bare "HH:mm" using the query date. */
function expandLocal(value: string, fallbackDate: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(trimmed)) return trimmed.slice(0, 16);
  const hhmm = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (hhmm) return `${fallbackDate}T${hhmm[1]!.padStart(2, "0")}:${hhmm[2]}`;
  throw new Error(`unrecognised local time format "${value}"`);
}

export interface NormalizeContext {
  query: RouteQuery;
  sourceName: string;
  sourceUrl: string;
}

export interface NormalizeResult {
  rows: FlightRow[];
  dropped: number;
}

export function normalizeAll(raw: RawFlight[], context: NormalizeContext): NormalizeResult {
  const rows: FlightRow[] = [];
  let dropped = 0;

  for (const [index, item] of raw.entries()) {
    try {
      rows.push(normalizeOne(item, context));
    } catch (error) {
      dropped += 1;
      log.warn(`dropped row ${index}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { rows, dropped };
}

function normalizeOne(raw: RawFlight, context: NormalizeContext): FlightRow {
  const { query, sourceName, sourceUrl } = context;

  const require = <T>(value: T | null | undefined, field: string): T => {
    if (value === null || value === undefined || value === "") {
      throw new Error(`missing required field "${field}"`);
    }
    return value;
  };

  const carrier = require(raw.carrier, "carrier").toUpperCase();
  const flightNumber = require(raw.flightNumber, "flightNumber");

  const departUtc = localToUtc(expandLocal(require(raw.departLocal, "departLocal"), query.date), timezoneFor(query.origin));
  const arriveUtc = localToUtc(
    expandLocal(require(raw.arriveLocal, "arriveLocal"), query.date),
    timezoneFor(query.destination),
  );

  // An overnight arrival reads as "earlier" until the date rolls. Correcting it
  // here is safe; a still-negative delta after the roll means the timezone map
  // or the parse is wrong, and that must fail rather than be papered over.
  let arrival = arriveUtc;
  if (arrival.getTime() <= departUtc.getTime()) {
    arrival = new Date(arrival.getTime() + 86_400_000);
  }
  if (arrival.getTime() <= departUtc.getTime()) {
    throw new Error(`arrival ${arrival.toISOString()} is not after departure ${departUtc.toISOString()}`);
  }

  const deltaMinutes = Math.round((arrival.getTime() - departUtc.getTime()) / 60_000);
  const durationMinutes = raw.durationMinutes ?? deltaMinutes;
  if (Math.abs(durationMinutes - deltaMinutes) > 2) {
    throw new Error(
      `durationMinutes ${durationMinutes} disagrees with the depart/arrive delta ${deltaMinutes} by more than 2 minutes ` +
        `— likely a wrong timezone for ${query.origin} or ${query.destination}`,
    );
  }

  const partial = raw.refundable == null || raw.baggageKg == null || !raw.fareBasis;

  const candidate: FlightRow = {
    id: `${carrier}${flightNumber}-${query.date.replace(/-/g, "")}-${query.cabin}`,
    carrier,
    carrierName: raw.carrierName ?? carrier,
    flightNumber,
    origin: query.origin,
    destination: query.destination,
    departUtc: departUtc.toISOString(),
    arriveUtc: arrival.toISOString(),
    durationMinutes,
    stops: raw.stops ?? 0,
    cabin: query.cabin,
    priceMinor: require(raw.priceMinor, "priceMinor"),
    currency: (raw.currency ?? "IDR").toUpperCase(),
    refundable: raw.refundable ?? DEFAULTS.refundable,
    baggageKg: raw.baggageKg ?? DEFAULTS.baggageKg,
    fareBasis: raw.fareBasis ?? DEFAULTS.fareBasis,
    _meta: {
      source: sourceName,
      scrapedAt: new Date().toISOString(),
      sourceUrl,
      ...(partial ? { partial: true } : {}),
    },
  };

  const parsed = FlightRow.safeParse(candidate);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  return parsed.data;
}
