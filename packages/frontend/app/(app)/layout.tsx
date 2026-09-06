// App layout (sidebar shell)
import type { ReactNode } from "react";
import { fontVars } from "~~/utils/autovoyage/fonts";
import { Sidebar } from "~~/components/autovoyage/layout/Sidebar";
import { getCurrentTripContext } from "~~/services/autovoyage/tripData";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const context = await getCurrentTripContext();
  return (
    <div
      className={`${fontVars} flex min-h-svh bg-av-bg text-av-text`}
      style={{ fontFamily: "var(--font-rubik), ui-sans-serif, system-ui, sans-serif" }}
    >
      <Sidebar context={context} />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
