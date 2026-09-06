"use client";

// Chat composer
import { useState } from "react";

export function Composer() {
  const [draft, setDraft] = useState("");

  return (
    <form
      className="border-t border-av-border bg-av-card px-6 py-4"
      onSubmit={e => {
        e.preventDefault();
        console.info("[AutoVoyage] chat message:", draft);
        setDraft("");
      }}
    >
      <div className="mx-auto flex max-w-[760px] items-center gap-3 rounded border border-av-border px-4 py-1.5">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Ask anything about your trip..."
          className="w-full bg-transparent py-1.5 text-[14px] text-av-text outline-none placeholder:text-av-muted"
        />
        <button
          type="submit"
          className="flex-shrink-0 rounded bg-av-blue px-4 py-2 text-[13px] font-medium text-av-paper transition-colors hover:bg-av-blue-hover"
        >
          Send
        </button>
      </div>
    </form>
  );
}
