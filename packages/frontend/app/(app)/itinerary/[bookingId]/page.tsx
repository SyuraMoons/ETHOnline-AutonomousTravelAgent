// One booked trip in full — flights, stay, activities, the agent's day-by-day plan, what the
// card was charged, and the x402 payments that bought the flight data. Real data: getBookingForOwner()
// reads the row /api/execute wrote at booking time, scoped to the signed-in owner.
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlightRow } from "~~/components/autovoyage/plan/FlightRow";
import { PlanSection } from "~~/components/autovoyage/plan/PlanSection";
import { StatusPill } from "~~/components/autovoyage/ui/StatusPill";
import { getBookingForOwner } from "~~/services/autovoyage/bookingStore";
import { formatUsd } from "~~/services/autovoyage/currency";
import { sessionEmail } from "~~/services/autovoyage/profile";

function timeOf(iso: string): string {
  return new Date(iso).toISOString().slice(11, 16);
}

function dateOf(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export default async function TripDetailPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const email = await sessionEmail();
  if (!email) notFound();

  const booking = await getBookingForOwner(email, bookingId);
  if (!booking) notFound();

  const { dossier } = booking;
  const legCount = dossier.option.legs.length;

  // Every activity keyed to the calendar date it happens on, so the day-by-day section can
  // slot real, paid-for activities in alongside the agent's free-text suggestions for that day.
  const activitiesByDate = new Map<string, typeof dossier.activities>();
  for (const activity of dossier.activities) {
    const date = dateOf(activity.startUtc);
    activitiesByDate.set(date, [...(activitiesByDate.get(date) ?? []), activity]);
  }

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-4 px-6 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-av-text">
            {dossier.trip.origin} → {dossier.trip.destination}
          </h1>
          <p className="m-0 mt-0.5 text-[13px] text-av-muted">
            {dossier.trip.departDate}
            {dossier.trip.returnDate ? ` → ${dossier.trip.returnDate}` : ""} · {dossier.trip.paxCount} traveller
            {dossier.trip.paxCount === 1 ? "" : "s"}
            {booking.confirmationCode ? ` · Ref ${booking.confirmationCode}` : ""}
          </p>
        </div>
        <StatusPill tone="approved">Booked</StatusPill>
      </header>

      <PlanSection label="Flights" price={formatUsd(dossier.option.totalMinor)}>
        {dossier.option.legs.map((leg, i) => (
          <FlightRow
            key={leg.offerId}
            tag={i === 0 ? "OUT" : "RET"}
            airline={leg.airline}
            route={`${timeOf(leg.departUtc)} ${leg.origin} → ${timeOf(leg.arriveUtc)} ${leg.destination}`}
            meta={`${dossier.option.cabin} · flight ${leg.flightNumber}`}
            last={i === legCount - 1}
            readOnly
          />
        ))}
      </PlanSection>

      {dossier.stay ? (
        <PlanSection label="Stay" price={formatUsd(dossier.stay.priceMinor)}>
          <div className="flex items-start gap-4 px-4 py-3">
            <span className="w-24 flex-shrink-0 pt-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-av-muted">
              {dossier.stay.checkIn} → {dossier.stay.checkOut}
            </span>
            <p className="m-0 text-[14px] font-semibold text-av-text">Hotel {dossier.stay.hotelId}</p>
          </div>
        </PlanSection>
      ) : null}

      {dossier.activities.length > 0 ? (
        <PlanSection label="Activities" price={formatUsd(dossier.activities.reduce((sum, a) => sum + a.priceMinor, 0))}>
          {dossier.activities.map((activity, i) => (
            <div
              key={`${activity.activityId}-${activity.startUtc}`}
              className={`flex items-start gap-4 px-4 py-3 ${i === dossier.activities.length - 1 ? "" : "border-b border-av-border"}`}
            >
              <span className="w-24 flex-shrink-0 pt-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-av-muted">
                {dateOf(activity.startUtc)} {timeOf(activity.startUtc)}
              </span>
              <div>
                <p className="m-0 text-[14px] font-semibold text-av-text">{activity.activityId}</p>
                <p className="m-0 mt-0.5 text-[13px] text-av-muted">{formatUsd(activity.priceMinor)}</p>
              </div>
            </div>
          ))}
        </PlanSection>
      ) : null}

      {dossier.days.length > 0 ? (
        <PlanSection label="Day by day">
          {dossier.days.map((day, i) => (
            <div
              key={day.dayNumber}
              className={`px-4 py-3 ${i === dossier.days.length - 1 ? "" : "border-b border-av-border"}`}
            >
              <p className="m-0 text-[14px] font-semibold text-av-text">
                Day {day.dayNumber} · {day.date} · {day.title}
              </p>
              {day.notes ? <p className="m-0 mt-1 text-[13px] text-av-muted">{day.notes}</p> : null}
              {activitiesByDate.get(day.date)?.length ? (
                <p className="m-0 mt-1.5 text-[12px] text-av-muted">
                  Booked:{" "}
                  {activitiesByDate
                    .get(day.date)!
                    .map(a => a.activityId)
                    .join(", ")}
                </p>
              ) : null}
              {day.suggestions.length > 0 ? (
                <ul className="m-0 mt-1.5 list-disc pl-4 text-[12px] text-av-muted">
                  {day.suggestions.map((s, j) => (
                    <li key={j}>{s} (agent suggestion, not booked)</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </PlanSection>
      ) : null}

      <PlanSection label="Payment">
        <div className="flex flex-col px-4 py-2">
          <div className="flex items-center justify-between py-1.5 text-[14px]">
            <span className="text-av-muted">
              Card charged {booking.cardLast4 ? `· •••• ${booking.cardLast4}` : ""} (simulated)
            </span>
            <span className="text-av-text">{formatUsd(booking.fareTotalMinor)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-av-border py-2.5 text-[15px] font-semibold text-av-text">
            <span>Total charged</span>
            <span>{formatUsd(booking.fareTotalMinor)}</span>
          </div>
        </div>
      </PlanSection>

      {dossier.searchSpend.length > 0 ? (
        <PlanSection label="x402 flight-data payments">
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-3">
            {dossier.searchSpend.map((spend, i) => (
              <a
                key={i}
                href={spend.hashscanUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] text-av-blue no-underline hover:opacity-70"
              >
                {spend.amountHbar} HBAR ↗
              </a>
            ))}
          </div>
        </PlanSection>
      ) : null}

      <div className="mt-2 flex gap-3">
        <Link
          href="/itinerary"
          className="rounded border border-av-border px-4 py-2.5 text-[14px] font-medium text-av-text no-underline transition-colors hover:bg-av-bg"
        >
          Back to my trips
        </Link>
        <Link
          href="/audit"
          className="rounded bg-av-blue px-4 py-2.5 text-[14px] font-medium text-av-paper no-underline transition-colors hover:bg-av-blue-hover"
        >
          View audit trail
        </Link>
      </div>
    </div>
  );
}
