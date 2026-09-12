// Trip Plan page — a three-stage workspace (search → results → plan).
// Stays a server component so it can seed the Stay/Activities fixture and the
// post-booking modal; everything stateful lives under <PlanProvider> (mounted in the
// (app) layout, shared with /chat).
import { Suspense } from "react";
import { BookingConfirmedModal } from "~~/components/autovoyage/approval/BookingConfirmedModal";
import { AgentPanel } from "~~/components/autovoyage/plan/AgentPanel";
import { PlanWorkspace } from "~~/components/autovoyage/plan/PlanWorkspace";
import { getBooking, getTripPlan } from "~~/services/autovoyage/tripData";

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
      <Suspense fallback={null}>
        <AgentPanel />
      </Suspense>

      {booking ? <BookingConfirmedModal booking={booking} /> : null}
    </div>
  );
}
