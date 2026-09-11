import type { RawFlight } from "../normalize.js";
import { mapBookingOffer } from "./booking.js";

/**
 * Per-site raw -> RawFlight mappers.
 *
 * Adapters return whatever the upstream gave them, so the shape is site-
 * specific by definition. Adding a site means adding one mapper and one line
 * here; normalize.ts never changes.
 */
const MAPPERS: Record<string, (raw: unknown) => RawFlight> = {
  booking: mapBookingOffer,
};

export function mapperFor(site: string): (raw: unknown) => RawFlight {
  const mapper = MAPPERS[site];
  if (!mapper) {
    throw new Error(`No mapper for site "${site}". Add one in src/mappers/ and register it in src/mappers/index.ts.`);
  }
  return mapper;
}
