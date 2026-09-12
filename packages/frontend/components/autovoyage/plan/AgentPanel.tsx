"use client";

// Agent panel — the right rail on /plan.
//
// It no longer owns any conversation state or talks to /api/plan directly: the
// search bar and this composer must produce the same trip, so both go through
// PlanProvider. All that is local here is the draft and the collapsed/expanded
// preference.
import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { CollapseIcon, ExpandIcon, PopoutIcon, SendIcon } from "../ui/icons";
import { usePlan } from "./PlanProvider";
import { SuggestionChips } from "./SuggestionChips";
import { ChatDossierCard } from "~~/components/autovoyage/chat/ChatDossierCard";
import { ChatFlightCard } from "~~/components/autovoyage/chat/ChatFlightCard";
import { ChatRunSteps } from "~~/components/autovoyage/chat/ChatRunSteps";
import { ChatScroller } from "~~/components/autovoyage/chat/ChatScroller";
import { HistoryMenu } from "~~/components/autovoyage/chat/HistoryMenu";
import { budgetNudgeText } from "~~/components/autovoyage/chat/budgetNudge";
import { useAutoBrief } from "~~/components/autovoyage/chat/useAutoBrief";
import type { AgentMessage } from "~~/types/autovoyage/plan";

const OPEN_STORAGE_KEY = "av.agentPanelOpen";

function Bubble({ message }: { message: AgentMessage }) {
  if (message.from === "user") {
    return (
      <div className="max-w-[85%] self-end rounded-lg rounded-tr-sm bg-av-blue px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line text-av-paper">
        {message.text}
      </div>
    );
  }
  return (
    <div className="flex max-w-[85%] flex-col items-start gap-2 self-start">
      {message.steps && message.steps.length > 0 ? <ChatRunSteps steps={message.steps} /> : null}
      {message.text ? (
        <div className="rounded-lg rounded-tl-sm bg-av-bg px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line text-av-text">
          {message.text}
        </div>
      ) : null}
      {message.results ? message.results.map((r, j) => <ChatFlightCard key={j} option={r} />) : null}
      {message.dossier && message.id ? (
        <ChatDossierCard messageId={message.id} dossier={message.dossier} booking={message.booking} />
      ) : null}
      {message.budgetRequest ? (
        <div className="rounded-lg rounded-tl-sm bg-av-bg px-3 py-2 text-[13px] leading-relaxed text-av-text">
          {budgetNudgeText(message.budgetRequest.reasonNote)}
        </div>
      ) : null}
    </div>
  );
}

export function AgentPanel({ statusNote }: { statusNote?: string }) {
  useAutoBrief();
  const { messages, pending, sendBrief } = usePlan();
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(OPEN_STORAGE_KEY);
      if (stored !== null) setOpen(stored === "true");
    } catch {
      // ignore (e.g. private browsing)
    }
  }, []);

  function setPanelOpen(next: boolean) {
    setOpen(next);
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, String(next));
    } catch {
      // ignore (e.g. private browsing)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const brief = draft.trim();
    if (!brief || pending) return;
    setDraft("");
    void sendBrief(brief);
  }

  if (!open) {
    return (
      <aside className="sticky top-0 flex h-svh w-12 flex-shrink-0 flex-col items-center border-l border-av-border bg-av-card py-3">
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          aria-label="Open agent panel"
          title="Open agent panel"
          className="rounded p-1.5 text-av-muted transition-opacity hover:opacity-70"
        >
          <ExpandIcon size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="sticky top-0 flex h-svh w-[340px] flex-shrink-0 flex-col overflow-hidden border-l border-av-border bg-av-card">
      <div className="flex items-center justify-between border-b border-av-border px-4 py-3">
        <span className="text-[14px] font-semibold text-av-text">Agent</span>
        <div className="flex items-center gap-3">
          <HistoryMenu />
          <Link
            href="/chat"
            aria-label="Open full-screen chat"
            title="Open full-screen chat"
            className="text-av-muted transition-opacity hover:opacity-70"
          >
            <PopoutIcon size={16} />
          </Link>
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            aria-label="Close agent panel"
            title="Close agent panel"
            className="text-av-muted transition-opacity hover:opacity-70"
          >
            <CollapseIcon size={16} />
          </button>
        </div>
      </div>

      <ChatScroller count={messages.length}>
        <div className="flex flex-col gap-3 p-4">
          {messages.map((m, i) => (
            <Bubble key={m.id ?? i} message={m} />
          ))}
          {pending ? (
            <div className="rounded bg-av-bg px-3 py-2 text-[12px] font-medium text-av-muted">Thinking...</div>
          ) : statusNote ? (
            <div className="rounded bg-av-amber/10 px-3 py-2 text-[12px] font-medium text-av-amber">{statusNote}</div>
          ) : null}
        </div>
      </ChatScroller>

      {messages.length === 0 && !pending ? (
        <div className="border-t border-av-border p-3">
          <SuggestionChips />
        </div>
      ) : null}

      <form className="border-t border-av-border p-3" onSubmit={handleSubmit}>
        <div className="flex items-center gap-2 rounded border border-av-border px-3 py-1.5">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Ask anything about your trip..."
            disabled={pending}
            className="w-full bg-transparent py-1 text-[13px] text-av-text outline-none placeholder:text-av-muted"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={pending}
            className="rounded bg-av-blue p-1.5 text-av-paper transition-colors hover:bg-av-blue-hover disabled:opacity-50"
          >
            <SendIcon size={15} />
          </button>
        </div>
      </form>
    </aside>
  );
}
