// Approval page
import { ApprovalFocus } from "~~/components/autovoyage/approval/ApprovalFocus";
import { AgentPanel } from "~~/components/autovoyage/plan/AgentPanel";
import { getApproval } from "~~/services/autovoyage/tripData";

export default async function ApprovePage() {
  const approval = await getApproval();

  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col px-6 py-6">
        <ApprovalFocus booking={approval.booking} />
      </div>
      <AgentPanel statusNote={approval.statusNote} />
    </div>
  );
}
