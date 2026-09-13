import { BookedTrip, type BookedTripSummary, type BookingResponse, type TripDossier } from "@sh/contracts";
import "server-only";
import { db } from "~~/services/db/supabase";

/**
 * Postgres-backed trip history, keyed by the signed-in email (see supabase/schema.sql
 * `bookings`) — a passenger's booked trips follow them, not the mandate that happened to pay
 * for the searches. Unlike dossierStore, rows here have no TTL: a booked trip must still be
 * readable weeks later, at the destination.
 */

function summarize(row: Record<string, unknown>): BookedTripSummary {
  const dossier = row.dossier as TripDossier;
  return {
    bookingId: row.booking_id as string,
    origin: dossier.trip.origin,
    destination: dossier.trip.destination,
    departDate: dossier.trip.departDate,
    returnDate: dossier.trip.returnDate,
    paxCount: dossier.trip.paxCount,
    legCount: dossier.option.legs.length,
    hasStay: Boolean(dossier.stay),
    activityCount: dossier.activities.length,
    fareTotalMinor: row.fare_total_minor as number,
    currency: row.currency as string,
    bookedAt: (row.booked_at as string) ?? new Date().toISOString(),
  };
}

function toBookedTrip(row: Record<string, unknown>): BookedTrip | null {
  const parsed = BookedTrip.safeParse({
    bookingId: row.booking_id,
    ownerEmail: row.owner_email,
    confirmationCode: row.confirmation_code ?? undefined,
    status: row.status,
    itineraryHash: row.itinerary_hash,
    dossier: row.dossier,
    fareTotalMinor: row.fare_total_minor,
    currency: row.currency,
    cardLast4: row.card_last4 ?? undefined,
    signature: row.signature ?? undefined,
    bookedAt: row.booked_at,
  });
  if (!parsed.success) {
    console.error(`bookingStore: stored booking ${row.booking_id} does not parse`, parsed.error.flatten());
    return null;
  }
  return parsed.data;
}

/**
 * Writes the trip-history row the moment the supplier confirms a booking. Best-effort like
 * submitAuditEvent — the supplier already confirmed and the traveller is already booked, so a
 * store failure here must not turn a real booking into a refusal; it only means the trip won't
 * show up in "My trips" later.
 */
export async function saveBooking(ownerEmail: string, dossier: TripDossier, response: BookingResponse): Promise<void> {
  const confirmed = response.confirmed;
  if (!confirmed) return;

  const { error } = await db()
    .from("bookings")
    .upsert({
      booking_id: response.bookingId,
      owner_email: ownerEmail,
      dossier_id: dossier.dossierId,
      confirmation_code: response.confirmationCode ?? null,
      status: response.status,
      itinerary_hash: dossier.itineraryHash,
      depart_date: dossier.trip.departDate,
      return_date: dossier.trip.returnDate ?? null,
      dossier,
      fare_total_minor: confirmed.totalMinor,
      currency: confirmed.currency,
      card_last4: confirmed.fareCharged.last4,
      signature: response.signature ?? null,
    });
  if (error) console.error(`saveBooking: ${error.message}`);
}

/** Every trip an owner has booked, newest departure first. */
export async function listBookings(ownerEmail: string): Promise<BookedTripSummary[]> {
  const { data, error } = await db()
    .from("bookings")
    .select("booking_id, dossier, fare_total_minor, currency, booked_at")
    .eq("owner_email", ownerEmail)
    .order("depart_date", { ascending: false });
  if (error) throw new Error(`listBookings: ${error.message}`);
  return (data ?? []).map(row => summarize(row as Record<string, unknown>));
}

/** One booking, or null when it doesn't exist or belongs to someone else. */
export async function getBookingForOwner(ownerEmail: string, bookingId: string): Promise<BookedTrip | null> {
  const { data, error } = await db()
    .from("bookings")
    .select()
    .eq("booking_id", bookingId)
    .eq("owner_email", ownerEmail)
    .maybeSingle();
  if (error) throw new Error(`getBookingForOwner: ${error.message}`);
  if (!data) return null;
  return toBookedTrip(data as Record<string, unknown>);
}
