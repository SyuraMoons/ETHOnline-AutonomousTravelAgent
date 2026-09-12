// Chat page
import { Suspense } from "react";
import Link from "next/link";
import { ChatPageBody } from "~~/components/autovoyage/chat/ChatPageBody";
import { HistoryMenu } from "~~/components/autovoyage/chat/HistoryMenu";
import { SkeletonBlock } from "~~/components/autovoyage/ui/Skeleton";
import { CollapseIcon } from "~~/components/autovoyage/ui/icons";

function ChatBodyFallback() {
  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-3 px-6 py-6">
      <SkeletonBlock className="ml-auto h-10 w-2/5" />
      <SkeletonBlock className="h-16 w-3/5" />
      <SkeletonBlock className="ml-auto h-10 w-1/3" />
    </div>
  );
}

export default function ChatPage() {
  return (
    <div className="fixed inset-y-0 left-[236px] right-0 flex flex-col">
      <header className="flex items-center justify-between border-b border-av-border bg-av-card px-4 py-3 sm:px-6">
        <span className="text-[14px] font-semibold text-av-text">Agent</span>
        <div className="flex items-center gap-3">
          <HistoryMenu />
          <Link
            href="/plan"
            aria-label="Collapse to panel"
            title="Collapse to panel"
            className="flex items-center gap-1.5 text-[13px] font-medium text-av-muted no-underline transition-opacity hover:opacity-70"
          >
            Collapse
            <CollapseIcon size={16} />
          </Link>
        </div>
      </header>
      {/* useAutoBrief (inside ChatPageBody) reads useSearchParams, which requires a Suspense
          boundary in the app router. */}
      <Suspense fallback={<ChatBodyFallback />}>
        <ChatPageBody />
      </Suspense>
    </div>
  );
}
