// Trip Plan page
import { getBooking, getTripPlan } from "~~/services/autovoyage/tripData";
import { formatUsd } from "~~/services/autovoyage/currency";
import { AgentSteps } from "~~/components/autovoyage/plan/AgentSteps";
import { PlanSection } from "~~/components/autovoyage/plan/PlanSection";
import { FlightRow } from "~~/components/autovoyage/plan/FlightRow";
import { StayCard } from "~~/components/autovoyage/plan/StayCard";
import { ActivityPicker } from "~~/components/autovoyage/plan/ActivityPicker";
import { AgentPanel } from "~~/components/autovoyage/plan/AgentPanel";
import { StatusPill } from "~~/components/autovoyage/ui/StatusPill";
import { BookingConfirmedModal } from "~~/components/autovoyage/approval/BookingConfirmedModal";

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ booked?: string }> }) {
  const { booked } = await searchParams;
  const [plan, booking] = await Promise.all([getTripPlan(), booked ? getBooking() : Promise.resolve(null)]);

  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-av-border bg-av-card px-6 py-4">
          <div>
            <h1 className="text-[18px] font-semibold text-av-text">Your trip plan</h1>
            <p className="m-0 mt-0.5 text-[13px] text-av-muted">
              Everything the agent has planned so far. Review the detail before it books.
            </p>
          </div>
          <div className="h-8 w-8 flex-shrink-0 rounded-full border border-av-border bg-av-bg" />
        </header>

        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-6 py-6">
          <AgentSteps progress={plan.progress} />

          <PlanSection
            label="Flights"
            pill={<StatusPill tone={plan.flights.status === "auto_approved" ? "approved" : "needs"}>
              {plan.flights.status === "auto_approved" ? "Auto-approved" : "Needs approval"}
            </StatusPill>}
            price={formatUsd(plan.flights.priceMinor)}
          >
            {plan.flights.legs.map((leg, i) => (
              <FlightRow key={leg.tag} {...leg} last={i === plan.flights.legs.length - 1} />
            ))}
          </PlanSection>

          <PlanSection
            label="Stay"
            highlight={plan.stay.status === "needs_approval"}
            pill={<StatusPill tone={plan.stay.status === "auto_approved" ? "approved" : "needs"}>
              {plan.stay.status === "auto_approved" ? "Auto-approved" : "Needs approval"}
            </StatusPill>}
            price={formatUsd(plan.stay.priceMinor)}
          >
            <StayCard stay={plan.stay} />
          </PlanSection>

          <PlanSection label="Activities">
            <ActivityPicker activities={plan.activities} />
          </PlanSection>
        </div>
      </div>

      <AgentPanel messages={plan.agent} />

      {booking ? <BookingConfirmedModal booking={booking} /> : null}
    </div>
  );
}
