"use client";

// The /plan empty state: nothing has been searched yet, so there is no itinerary
// to show. Either input here — a tab's search or a chip — ends up as a brief the
// agent answers, and its answer is what opens the results.
import { usePlan } from "./PlanProvider";
import { TripSearch } from "./TripSearch";

export function SearchLanding() {
  const { pending } = usePlan();

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1.5">
        <h2 className="m-0 text-[28px] leading-tight font-semibold tracking-tight text-av-text">Where to next?</h2>
        <p className="m-0 text-[14px] text-av-muted">
          Tell the agent where you are going, or fill this in. It pays for its own flight search over x402 and only
          books what fits your limits.
        </p>
      </div>

      <TripSearch />

      {pending ? (
        <div className="flex items-center gap-2.5 rounded border border-av-border bg-av-card px-4 py-3 text-[13px] text-av-muted">
          <span className="h-2 w-2 animate-pulse-fast rounded-full bg-av-blue" />
          Agent is working on it...
        </div>
      ) : null}
    </div>
  );
}
