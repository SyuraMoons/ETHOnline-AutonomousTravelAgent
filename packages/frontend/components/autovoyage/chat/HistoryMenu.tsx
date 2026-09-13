"use client";

// Chat-history dropdown — lists past sessions for the connected wallet (see
// services/autovoyage/chatThreads.ts / GET /api/threads?list=true) and lets the user switch
// into one, plus a "New chat" action. No Dialog/Popover primitive exists in this app, so this
// is a plain absolutely-positioned panel matching the Tailwind utility style used elsewhere.
import { useEffect, useRef, useState } from "react";
import { usePlan } from "~~/components/autovoyage/plan/PlanProvider";
import { HistoryIcon, PlusIcon } from "~~/components/autovoyage/ui/icons";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";

type ThreadListItem = { threadId: string; updatedAt: string; title: string };

export function HistoryMenu() {
  const { accountId } = useHederaWalletConnect();
  const { threadId, switchThread, startNewThread } = usePlan();
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<ThreadListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !accountId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/threads?payerAccountId=${encodeURIComponent(accountId)}&list=true`);
        if (cancelled) return;
        if (res.ok) setThreads((await res.json()) as ThreadListItem[]);
      } catch {
        // Best-effort — an empty list just means nothing to show.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, accountId]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!accountId) {
    // No wallet connected — chat threads are scoped to the wallet's account id, so there's
    // nothing to switch between yet. Render the controls disabled rather than hiding them
    // entirely, so a user who signed in via OAuth only (no wallet) can see why they're inert
    // instead of the buttons silently disappearing.
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="New chat"
          title="Connect a wallet in the sidebar to use chat history"
          disabled
          className="flex h-8 w-8 items-center justify-center rounded text-av-muted opacity-40"
        >
          <PlusIcon size={16} />
        </button>
        <button
          type="button"
          aria-label="Chat history"
          title="Connect a wallet in the sidebar to use chat history"
          disabled
          className="flex h-8 w-8 items-center justify-center rounded text-av-muted opacity-40"
        >
          <HistoryIcon size={16} />
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-1.5">
      <button
        type="button"
        aria-label="New chat"
        title="New chat"
        onClick={() => {
          startNewThread();
          setOpen(false);
        }}
        className="flex h-8 w-8 items-center justify-center rounded text-av-muted transition-opacity hover:opacity-70"
      >
        <PlusIcon size={16} />
      </button>
      <button
        type="button"
        aria-label="Chat history"
        title="Chat history"
        onClick={() => setOpen(prev => !prev)}
        className="flex h-8 w-8 items-center justify-center rounded text-av-muted transition-opacity hover:opacity-70"
      >
        <HistoryIcon size={16} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded border border-av-border bg-av-card py-1 shadow-lg">
          {loading && <div className="px-3 py-2 text-[13px] text-av-muted">Loading…</div>}
          {!loading && threads.length === 0 && (
            <div className="px-3 py-2 text-[13px] text-av-muted">No past chats yet.</div>
          )}
          {!loading &&
            threads.map(t => (
              <button
                key={t.threadId}
                type="button"
                onClick={() => {
                  void switchThread(t.threadId);
                  setOpen(false);
                }}
                className={`block w-full truncate px-3 py-2 text-left text-[13px] transition-colors hover:bg-av-border/30 ${
                  t.threadId === threadId ? "font-semibold text-av-text" : "text-av-muted"
                }`}
              >
                {t.title}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
