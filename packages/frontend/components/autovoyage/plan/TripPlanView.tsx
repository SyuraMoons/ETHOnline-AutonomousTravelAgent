"use client";

// Stage 3: the itinerary. This is the screen /plan used to show unconditionally.
//
// Flights come from the option you selected. Stay and Activities are still the
// tripData fixture — there is no hotel or activity schema in packages/contracts
// and no supplier endpoint behind them yet, so there is nothing real to wire.
import { StatusPill } from "../ui/StatusPill";
import { ActivityPicker } from "./ActivityPicker";
import { AgentSteps } from "./AgentSteps";
import { FlightRow } from "./FlightRow";
import { usePlan } from "./PlanProvider";
import { PlanSection } from "./PlanSection";
import { StayCard } from "./StayCard";
import type { FlightOption, SearchResult } from "@sh/contracts";
import { formatUsd } from "~~/services/autovoyage/currency";
import { formatLegTime, legDuration } from "~~/services/autovoyage/flightOptions";
import type { FlightLeg, PlanProgress, TripPlan } from "~~/types/autovoyage/plan";

/** Adapt a supplier leg onto the view shape FlightRow already speaks. */
function toFlightLeg(leg: SearchResult, index: number, cabin: string, stops: number): FlightLeg {
  const day = new Date(leg.departUtc).getUTCDate();
  return {
    tag: `${index === 0 ? "OUT" : "RET"} · ${day}`,
    airline: leg.airline,
    route: `${formatLegTime(leg.departUtc)} ${leg.origin} → ${formatLegTime(leg.arriveUtc)} ${leg.destination}`,
    meta: `${stops === 0 ? "nonstop" : `${stops} stop`} · ${legDuration(leg)} · ${cabin}`,
  };
}

function progressFor(destination: string, option: FlightOption, feeHbar: string | undefined): PlanProgress {
  return {
    title: `Planning your trip to ${destination}`,
    elapsed: `${option.legs.length} leg${option.legs.length === 1 ? "" : "s"}`,
    steps: [
      { label: "Understanding your brief", status: "done" },
      { label: "Searching", status: "done", note: feeHbar ? `paid ${feeHbar} HBAR · x402` : "x402" },
      { label: "Assembling your plan", status: "active" },
    ],
  };
}

export function TripPlanView({ fixture }: { fixture: TripPlan }) {
  const { selected, trip, payment, backToResults } = usePlan();

  // No selection means the page was opened directly on the fixture (e.g. via
  // ?booked=1) — fall back to what it always showed.
  const legs: FlightLeg[] = selected
    ? selected.legs.map((leg, i) => toFlightLeg(leg, i, selected.cabin, selected.stops))
    : fixture.flights.legs;
  const flightsPrice = selected ? selected.totalMinor : fixture.flights.priceMinor;
  const destination = trip?.destination ?? fixture.destination;
  const progress = selected ? progressFor(destination, selected, payment?.amountHbar) : fixture.progress;

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-6 py-6">
      <AgentSteps progress={progress} />

      <PlanSection
        label="Flights"
        pill={
          <StatusPill tone={fixture.flights.status === "auto_approved" ? "approved" : "needs"}>
            {fixture.flights.status === "auto_approved" ? "Auto-approved" : "Needs approval"}
          </StatusPill>
        }
        price={formatUsd(flightsPrice)}
      >
        {legs.map((leg, i) => (
          <FlightRow key={leg.tag} {...leg} last={i === legs.length - 1} onChange={backToResults} />
        ))}
      </PlanSection>

      <PlanSection
        label="Stay"
        highlight={fixture.stay.status === "needs_approval"}
        pill={
          <StatusPill tone={fixture.stay.status === "auto_approved" ? "approved" : "needs"}>
            {fixture.stay.status === "auto_approved" ? "Auto-approved" : "Needs approval"}
          </StatusPill>
        }
        price={formatUsd(fixture.stay.priceMinor)}
      >
        <StayCard stay={fixture.stay} />
      </PlanSection>

      <PlanSection label="Activities">
        <ActivityPicker activities={fixture.activities} />
      </PlanSection>
    </div>
  );
}
