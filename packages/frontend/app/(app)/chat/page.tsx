// Chat page
import Link from "next/link";
import { ApprovalFocus } from "~~/components/autovoyage/approval/ApprovalFocus";
import { ChatThread } from "~~/components/autovoyage/chat/ChatThread";
import { Composer } from "~~/components/autovoyage/chat/Composer";
import { CollapseIcon } from "~~/components/autovoyage/ui/icons";
import { getChat } from "~~/services/autovoyage/tripData";

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ approve?: string }> }) {
  const { approve } = await searchParams;
  const chat = await getChat();

  return (
    <div className="flex h-svh min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-av-border bg-av-card px-6 py-3">
        <span className="text-[14px] font-semibold text-av-text">Agent</span>
        <Link
          href="/plan"
          aria-label="Collapse to panel"
          title="Collapse to panel"
          className="flex items-center gap-1.5 text-[13px] font-medium text-av-muted no-underline transition-opacity hover:opacity-70"
        >
          Collapse
          <CollapseIcon size={16} />
        </Link>
      </header>
      <div className="flex-1 overflow-y-auto">
        <ChatThread messages={chat.messages} />
      </div>
      <Composer />

      {approve ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-av-ink/40 px-4">
          <div className="w-full max-w-[520px]">
            <ApprovalFocus booking={chat.approval} cancelHref="/chat" confirmHref="/plan?booked=1" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
