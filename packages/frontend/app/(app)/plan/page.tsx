// Trip Plan page — a three-stage workspace (search → results → plan).
// Stays a server component so it can seed the Stay/Activities fixture and the
// post-booking modal; everything stateful lives under <PlanProvider> (mounted in the
// (app) layout, shared with /chat).
import { Suspense } from "react";
import { AgentPanel } from "~~/components/autovoyage/plan/AgentPanel";
import { BookingConfirmedModal } from "~~/components/autovoyage/plan/BookingConfirmedModal";
import { PlanWorkspace } from "~~/components/autovoyage/plan/PlanWorkspace";
import { SkeletonBlock } from "~~/components/autovoyage/ui/Skeleton";
import { getBooking, getTripPlan } from "~~/services/autovoyage/tripData";

function AgentPanelFallback() {
  return (
    <aside className="sticky top-0 hidden h-svh w-[340px] flex-shrink-0 flex-col border-l border-av-border bg-av-card sm:flex">
      <div className="flex items-center justify-between border-b border-av-border px-4 py-3">
        <SkeletonBlock className="h-4 w-16" />
      </div>
      <div className="flex flex-col gap-3 p-4">
        <SkeletonBlock className="h-10 w-4/5" />
        <SkeletonBlock className="ml-auto h-10 w-3/5" />
        <SkeletonBlock className="h-16 w-4/5" />
      </div>
    </aside>
  );
}

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

        <PlanWorkspace fixture={plan} />
      </div>

      {/* useAutoBrief (inside AgentPanel) reads useSearchParams, which requires a Suspense
          boundary in the app router. */}
      <Suspense fallback={<AgentPanelFallback />}>
        <AgentPanel />
      </Suspense>

      {booking ? <BookingConfirmedModal booking={booking} /> : null}
    </div>
  );
}
