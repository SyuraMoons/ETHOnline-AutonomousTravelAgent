// My trips — every itinerary the signed-in traveller has booked, grouped by whether the
// departure is still ahead of them or already behind. Real data now: listBookings() reads the
// `bookings` table /api/execute writes to the moment the supplier confirms, not a fixture.
import Link from "next/link";
import type { BookedTripSummary } from "@sh/contracts";
import { MapPinIcon } from "~~/components/autovoyage/ui/icons";
import { listBookings } from "~~/services/autovoyage/bookingStore";
import { formatUsd } from "~~/services/autovoyage/currency";
import { sessionEmail } from "~~/services/autovoyage/profile";

function tripLabel(trip: BookedTripSummary): string {
  const parts = [`${trip.legCount} leg${trip.legCount === 1 ? "" : "s"}`];
  if (trip.hasStay) parts.push("1 stay");
  if (trip.activityCount > 0) parts.push(`${trip.activityCount} activit${trip.activityCount === 1 ? "y" : "ies"}`);
  return parts.join(" · ");
}

function TripCard({ trip }: { trip: BookedTripSummary }) {
  const dates = trip.returnDate ? `${trip.departDate} → ${trip.returnDate}` : trip.departDate;
  return (
    <Link
      href={`/itinerary/${trip.bookingId}`}
      className="flex items-center justify-between gap-4 rounded border border-av-border bg-av-card px-4 py-3.5 no-underline transition-colors hover:bg-av-bg"
    >
      <div className="min-w-0">
        <p className="m-0 text-[15px] font-semibold text-av-text">
          {trip.origin} → {trip.destination}
        </p>
        <p className="m-0 mt-0.5 text-[13px] text-av-muted">
          {dates} · {trip.paxCount} traveller{trip.paxCount === 1 ? "" : "s"} · {tripLabel(trip)}
        </p>
      </div>
      <span className="flex-shrink-0 text-[14px] font-semibold text-av-text">{formatUsd(trip.fareTotalMinor)}</span>
    </Link>
  );
}

export default async function ItineraryPage() {
  const email = await sessionEmail();
  const trips = email ? await listBookings(email) : [];

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = trips.filter(t => t.departDate >= today);
  const past = trips.filter(t => t.departDate < today);

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-6 px-6 py-6">
      <header>
        <h1 className="text-[22px] font-semibold text-av-text">My trips</h1>
        <p className="m-0 mt-0.5 text-[13px] text-av-muted">Every itinerary the agent has booked for you.</p>
      </header>

      {!email ? (
        <p className="m-0 text-[13px] text-av-muted">Sign in to see your booked trips.</p>
      ) : trips.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded border border-dashed border-av-border px-6 py-12 text-center">
          <MapPinIcon size={24} className="text-av-muted" />
          <p className="m-0 text-[14px] font-medium text-av-text">No trips booked yet</p>
          <p className="m-0 text-[13px] text-av-muted">Plan a trip and the agent will book it here once confirmed.</p>
          <Link
            href="/plan"
            className="mt-1 rounded bg-av-blue px-4 py-2 text-[13px] font-medium text-av-paper no-underline transition-colors hover:bg-av-blue-hover"
          >
            Plan a trip
          </Link>
        </div>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <section className="flex flex-col gap-2">
              <p className="m-0 font-mono text-[11px] uppercase tracking-[0.1em] text-av-muted">Upcoming</p>
              {upcoming.map(trip => (
                <TripCard key={trip.bookingId} trip={trip} />
              ))}
            </section>
          ) : null}

          {past.length > 0 ? (
            <section className="flex flex-col gap-2">
              <p className="m-0 font-mono text-[11px] uppercase tracking-[0.1em] text-av-muted">Past</p>
              {past.map(trip => (
                <TripCard key={trip.bookingId} trip={trip} />
              ))}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
