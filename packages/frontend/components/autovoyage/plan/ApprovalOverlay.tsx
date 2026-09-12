"use client";

// Shared confirm-booking overlay — mounted once in app/(app)/layout.tsx (inside
// PlanProvider) so it appears over whichever page is showing (/plan's rail or /chat's
// full-screen thread) the moment a flight is selected. One place, one PlanProvider,
// no risk of /plan and /chat drifting into two different confirm flows.
import { ApprovalFocus, type ApprovalSubject } from "~~/components/autovoyage/approval/ApprovalFocus";
import { usePlan } from "~~/components/autovoyage/plan/PlanProvider";

export function ApprovalOverlay() {
  const { selected, trip, planId, clearSelection } = usePlan();

  if (!selected) return null;

  const subject: ApprovalSubject = {
    title: selected.legs[0]?.airline ?? "Flight",
    subtitle: `${trip?.origin ?? selected.legs[0]?.origin} → ${trip?.destination ?? selected.legs[0]?.destination}`,
    priceMinor: selected.totalMinor,
    currency: selected.currency,
    itineraryHash: selected.itineraryHash,
    planId: planId ?? undefined,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-av-ink/40 px-4">
      <div className="w-full max-w-[520px]">
        <ApprovalFocus subject={subject} onCancel={clearSelection} onConfirmed={clearSelection} />
      </div>
    </div>
  );
}
