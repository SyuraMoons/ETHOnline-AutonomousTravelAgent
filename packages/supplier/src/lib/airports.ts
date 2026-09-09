// Airport metadata shared by the flight-data generator (scripts/) and the
// request-time cache filter (lib/flightsCache.ts). Both must agree on what
// "departing on the 15th" means, or a search silently drops valid flights.

// Fixed local UTC offsets. None of these airports observe DST except SYD,
// whose one-hour seasonal shift does not matter for a simulated dataset.
export const UTC_OFFSET_HOURS: Record<string, number> = {
  SIN: 8,
  CGK: 7,
  DPS: 8,
  NRT: 9,
  HND: 9,
  BKK: 7,
  HKG: 8,
  KUL: 8,
  SYD: 10,
};

/**
 * The departure date as a traveller means it: local at the origin airport.
 *
 * This is NOT the UTC date. A 06:45 departure from Singapore (UTC+8) is
 * 22:45 UTC the previous day, so filtering a search by UTC date would hide
 * every early-morning flight from the day the buyer actually asked for.
 */
export function localDepartureDate(departUtc: string, origin: string): string {
  const offsetHours = UTC_OFFSET_HOURS[origin] ?? 0;
  const departedAt = new Date(departUtc);
  if (Number.isNaN(departedAt.getTime())) {
    throw new TypeError(`localDepartureDate: invalid departUtc "${departUtc}"`);
  }
  return new Date(departedAt.getTime() + offsetHours * 3_600_000)
    .toISOString()
    .slice(0, 10);
}
