"use client";

// Agent panel
import { useState } from "react";
import Link from "next/link";
import { ExpandIcon, SendIcon } from "../ui/icons";
import type { AgentMessage } from "~~/types/autovoyage/plan";

function Bubble({ message }: { message: AgentMessage }) {
  if (message.from === "user") {
    return (
      <div className="max-w-[85%] self-end rounded-lg rounded-tr-sm bg-av-blue px-3 py-2 text-[13px] leading-relaxed text-av-paper">
        {message.text}
      </div>
    );
  }
  return (
    <div className="max-w-[85%] self-start rounded-lg rounded-tl-sm bg-av-bg px-3 py-2 text-[13px] leading-relaxed text-av-text">
      {message.text}
    </div>
  );
}

export function AgentPanel({ messages, statusNote }: { messages: AgentMessage[]; statusNote?: string }) {
  const [draft, setDraft] = useState("");

  return (
    <aside className="hidden w-[340px] flex-shrink-0 flex-col border-l border-av-border bg-av-card xl:flex">
      <div className="flex items-center justify-between border-b border-av-border px-4 py-3">
        <span className="text-[14px] font-semibold text-av-text">Agent</span>
        <Link
          href="/chat"
          aria-label="Open full-screen chat"
          title="Open full-screen chat"
          className="text-av-muted transition-opacity hover:opacity-70"
        >
          <ExpandIcon size={16} />
        </Link>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <Bubble key={i} message={m} />
        ))}
        {statusNote ? (
          <div className="rounded bg-av-amber/10 px-3 py-2 text-[12px] font-medium text-av-amber">{statusNote}</div>
        ) : null}
      </div>

      <form
        className="border-t border-av-border p-3"
        onSubmit={e => {
          e.preventDefault();
          console.info("[AutoVoyage] Agent message:", draft);
          setDraft("");
        }}
      >
        <div className="flex items-center gap-2 rounded border border-av-border px-3 py-1.5">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Ask anything about your trip..."
            className="w-full bg-transparent py-1 text-[13px] text-av-text outline-none placeholder:text-av-muted"
          />
          <button
            type="submit"
            aria-label="Send"
            className="rounded bg-av-blue p-1.5 text-av-paper transition-colors hover:bg-av-blue-hover"
          >
            <SendIcon size={15} />
          </button>
        </div>
      </form>
    </aside>
  );
}
