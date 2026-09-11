"use client";

// Full-screen chat body — reads the same conversation the /plan rail (AgentPanel) drives,
// via the shared PlanProvider mounted in app/(app)/layout.tsx. The confirm-booking overlay
// lives at the layout level (ApprovalOverlay), shared with /plan, not duplicated here.
import { ChatScroller } from "./ChatScroller";
import { ChatThread } from "./ChatThread";
import { Composer } from "./Composer";
import { useAutoBrief } from "./useAutoBrief";
import { usePlan } from "~~/components/autovoyage/plan/PlanProvider";

export function ChatPageBody() {
  useAutoBrief();
  const { messages } = usePlan();

  return (
    <>
      <ChatScroller count={messages.length}>
        <ChatThread messages={messages} />
      </ChatScroller>
      <Composer />
    </>
  );
}
