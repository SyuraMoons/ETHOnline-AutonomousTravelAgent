// Approval page
import { ApprovalFocus } from "~~/components/autovoyage/approval/ApprovalFocus";
import { AgentPanel } from "~~/components/autovoyage/plan/AgentPanel";
import { PlanProvider } from "~~/components/autovoyage/plan/PlanProvider";
import { getApproval } from "~~/services/autovoyage/tripData";

export default async function ApprovePage() {
  const approval = await getApproval();
  const { booking } = approval;

  return (
    // The rail keeps its own conversation here; this page never leaves the
    // "search" stage, so the provider is just backing the composer.
    <PlanProvider initialMessages={approval.agent}>
      <div className="flex min-w-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col px-6 py-6">
          <ApprovalFocus
            subject={{
              title: booking.name,
              subtitle: `${booking.nights} nights`,
              priceMinor: booking.priceMinor,
              note: booking.note,
            }}
          />
        </div>
        <AgentPanel statusNote={approval.statusNote} />
      </div>
    </PlanProvider>
  );
}
