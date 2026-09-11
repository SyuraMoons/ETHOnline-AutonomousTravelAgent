"use client";

// The main column of /plan. Which of the three stages renders is decided
// entirely by PlanProvider — nothing here initiates a search.
import { FlightResults } from "./FlightResults";
import { usePlan } from "./PlanProvider";
import { SearchBar } from "./SearchBar";
import { SearchLanding } from "./SearchLanding";
import { TripPlanView } from "./TripPlanView";
import type { TripPlan } from "~~/types/autovoyage/plan";

function StageHeader() {
  return (
    <div className="border-b border-av-border bg-av-card px-6 py-3">
      <div className="mx-auto w-full max-w-[760px]">
        <SearchBar variant="compact" />
      </div>
    </div>
  );
}

export function PlanWorkspace({ fixture }: { fixture: TripPlan }) {
  const { stage, trip } = usePlan();

  if (stage === "search") return <SearchLanding />;

  return (
    <>
      <StageHeader />
      {stage === "results" ? (
        <>
          {trip ? (
            <div className="mx-auto w-full max-w-[760px] px-6 pt-5">
              <h2 className="m-0 text-[18px] font-semibold text-av-text">
                {trip.origin} → {trip.destination}
              </h2>
              <p className="m-0 mt-0.5 text-[13px] text-av-muted">
                Pick a flight and the agent builds the rest of the trip around it.
              </p>
            </div>
          ) : null}
          <FlightResults />
        </>
      ) : (
        <TripPlanView fixture={fixture} />
      )}
    </>
  );
}
