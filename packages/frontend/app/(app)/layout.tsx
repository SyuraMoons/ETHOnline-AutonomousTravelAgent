// App layout (sidebar shell)
import type { ReactNode } from "react";
import { Sidebar } from "~~/components/autovoyage/layout/Sidebar";
import { ApprovalOverlay } from "~~/components/autovoyage/plan/ApprovalOverlay";
import { PlanProvider } from "~~/components/autovoyage/plan/PlanProvider";
import { getTripPlan } from "~~/services/autovoyage/tripData";
import { fontVars } from "~~/utils/autovoyage/fonts";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // Fetched once here (not per-page) so /plan's rail and /chat's full-screen view share one
  // PlanProvider instance and never drift into two notions of "the current conversation".
  const plan = await getTripPlan();
  return (
    <div
      className={`${fontVars} flex min-h-svh bg-av-bg text-av-text`}
      style={{ fontFamily: "var(--font-rubik), ui-sans-serif, system-ui, sans-serif" }}
    >
      <Sidebar />
      <PlanProvider initialMessages={plan.agent}>
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
        <ApprovalOverlay />
      </PlanProvider>
    </div>
  );
}
