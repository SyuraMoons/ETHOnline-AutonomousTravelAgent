// Itinerary page
import Link from "next/link";
import { getBooking } from "~~/services/autovoyage/tripData";
import { formatUsd } from "~~/services/autovoyage/currency";
import { PlanSection } from "~~/components/autovoyage/plan/PlanSection";
import { FlightRow } from "~~/components/autovoyage/plan/FlightRow";
import { OnChainProof } from "~~/components/autovoyage/ui/OnChainProof";
import { StatusPill } from "~~/components/autovoyage/ui/StatusPill";

export default async function ItineraryPage() {
  const b = await getBooking();

  return (
    <div className="mx-auto flex w-full max-w-[920px] flex-col gap-4 px-6 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-av-text">Your {b.destination} trip</h1>
          <p className="m-0 mt-0.5 text-[13px] text-av-muted">
            Booked · {b.dates} · {b.travelers} travelers · Ref {b.reference}
          </p>
        </div>
        <StatusPill tone="approved">Booked</StatusPill>
      </header>

      <PlanSection label="Flights" price={formatUsd(b.flights.priceMinor)}>
        {b.flights.legs.map((leg, i) => (
          <FlightRow key={leg.tag} {...leg} last={i === b.flights.legs.length - 1} readOnly />
        ))}
      </PlanSection>

      <PlanSection label="Stay" price={formatUsd(b.stay.priceMinor)}>
        <div className="flex items-start gap-4 px-4 py-3">
          <span className="w-12 flex-shrink-0 pt-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-av-muted">
            {b.stay.date}
          </span>
          <div>
            <p className="m-0 text-[14px] font-semibold text-av-text">{b.stay.name}</p>
            <p className="m-0 mt-0.5 text-[13px] text-av-muted">{b.stay.detail}</p>
          </div>
        </div>
      </PlanSection>

      <PlanSection label="Activities" price={formatUsd(b.activities.priceMinor)}>
        {b.activities.items.map((a, i) => (
          <div
            key={a.name}
            className={`flex items-start gap-4 px-4 py-3 ${i === b.activities.items.length - 1 ? "" : "border-b border-av-border"}`}
          >
            <span className="w-12 flex-shrink-0 pt-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-av-muted">
              {a.date}
            </span>
            <div>
              <p className="m-0 text-[14px] font-semibold text-av-text">{a.name}</p>
              <p className="m-0 mt-0.5 text-[13px] text-av-muted">{a.sub}</p>
            </div>
          </div>
        ))}
      </PlanSection>

      <PlanSection label="Payment">
        <div className="flex flex-col px-4 py-2">
          {b.payment.map(p => (
            <div key={p.label} className="flex items-center justify-between py-1.5 text-[14px]">
              <span className="text-av-muted">{p.label}</span>
              <span className="text-av-text">{formatUsd(p.amountMinor)}</span>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-av-border py-2.5 text-[15px] font-semibold text-av-text">
            <span>Total paid</span>
            <span>{formatUsd(b.totalMinor)}</span>
          </div>
        </div>
      </PlanSection>

      <PlanSection label="On-chain proof">
        <div className="px-4 py-3">
          <OnChainProof proof={b.proof} />
        </div>
      </PlanSection>

      <div className="mt-2 flex gap-3">
        <Link
          href="/plan"
          className="rounded border border-av-border px-4 py-2.5 text-[14px] font-medium text-av-text no-underline transition-colors hover:bg-av-bg"
        >
          Back to plan
        </Link>
        <button
          type="button"
          className="rounded bg-av-blue px-4 py-2.5 text-[14px] font-medium text-av-paper transition-colors hover:bg-av-blue-hover"
        >
          Download itinerary
        </button>
      </div>
    </div>
  );
}
