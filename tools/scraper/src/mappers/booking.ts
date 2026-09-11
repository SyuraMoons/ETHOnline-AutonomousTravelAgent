// Booking.com /api/flights/ offer -> RawFlight.
//
// Site-specific shape lives here, so normalize.ts stays generic and a site
// changing its payload is a change in one file.

import type { RawFlight } from "../normalize.js";

interface BookingMoney {
  currencyCode?: string;
  units?: number;
  nanos?: number;
}

interface BookingLeg {
  departureTime?: string;
  arrivalTime?: string;
  departureAirport?: { code?: string };
  arrivalAirport?: { code?: string };
  cabinClass?: string;
  totalTime?: number;
  flightStops?: unknown[];
  carriersData?: Array<{ name?: string; code?: string }>;
  flightInfo?: {
    flightNumber?: number;
    carrierInfo?: { marketingCarrier?: string; operatingCarrier?: string };
  };
}

interface BookingSegment {
  departureTime?: string;
  arrivalTime?: string;
  totalTime?: number;
  legs?: BookingLeg[];
  travellerCheckedLuggage?: Array<{ luggageAllowance?: { maxWeightPerPiece?: number; maxTotalWeight?: number } }>;
}

interface BookingOffer {
  segments?: BookingSegment[];
  priceBreakdown?: { total?: BookingMoney };
  brandedFareInfo?: { fareName?: string };
}

/**
 * IDR has no minor unit, so `units` IS the minor amount. `nanos` is a
 * sub-unit fraction Booking uses for its own rounding; we round to whole
 * units the way the site's own displayed price does.
 */
function toMinor(money: BookingMoney | undefined): number | null {
  if (!money || typeof money.units !== "number") return null;
  const fraction = typeof money.nanos === "number" ? money.nanos / 1e9 : 0;
  return Math.round(money.units + fraction);
}

export function mapBookingOffer(raw: unknown): RawFlight {
  const offer = raw as BookingOffer;
  const segment = offer.segments?.[0];
  const legs = segment?.legs ?? [];
  const first = legs[0];
  const last = legs[legs.length - 1];

  const info = first?.flightInfo;
  const carrier = info?.carrierInfo?.marketingCarrier ?? info?.carrierInfo?.operatingCarrier ?? first?.carriersData?.[0]?.code;

  // Stops across the whole segment: each extra leg is a connection, plus any
  // technical stops within a leg.
  const legStops = legs.reduce((total, leg) => total + (leg.flightStops?.length ?? 0), 0);
  const stops = Math.max(0, legs.length - 1) + legStops;

  // Booking reports seconds; FlightRow is minutes.
  const totalSeconds = segment?.totalTime;
  const durationMinutes = typeof totalSeconds === "number" ? Math.round(totalSeconds / 60) : null;

  // Checked baggage is per traveller and expressed per piece or as a total.
  const luggage = segment?.travellerCheckedLuggage?.[0]?.luggageAllowance;
  const baggageKg = luggage?.maxTotalWeight ?? luggage?.maxWeightPerPiece ?? null;

  return {
    carrier: carrier ?? null,
    carrierName: first?.carriersData?.[0]?.name ?? null,
    // A multi-leg itinerary is identified by its first marketing flight; the
    // remaining legs are captured by stops and the overall duration.
    flightNumber: info?.flightNumber === undefined ? null : String(info.flightNumber),
    // These are local wall-clock at their respective airports, with no zone
    // suffix — exactly what normalize expects.
    departLocal: segment?.departureTime ?? first?.departureTime ?? null,
    arriveLocal: segment?.arrivalTime ?? last?.arrivalTime ?? null,
    durationMinutes,
    stops,
    priceMinor: toMinor(offer.priceBreakdown?.total),
    currency: offer.priceBreakdown?.total?.currencyCode ?? null,
    // Not exposed in a search response; normalize tags the row _meta.partial.
    refundable: null,
    baggageKg,
    fareBasis: offer.brandedFareInfo?.fareName ?? null,
  };
}
