"use client";

// Chat composer
import { type FormEvent, useState } from "react";
import { usePlan } from "~~/components/autovoyage/plan/PlanProvider";

export function Composer() {
  const { pending, sendBrief } = usePlan();
  const [draft, setDraft] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const brief = draft.trim();
    if (!brief || pending) return;
    setDraft("");
    void sendBrief(brief);
  }

  return (
    <form
      className="border-t border-av-border bg-av-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4"
      onSubmit={handleSubmit}
    >
      <div className="mx-auto flex max-w-[760px] items-center gap-3 rounded border border-av-border px-4 py-1.5">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Ask anything about your trip..."
          disabled={pending}
          className="w-full bg-transparent py-1.5 text-[16px] text-av-text outline-none placeholder:text-av-muted sm:text-[14px]"
        />
        <button
          type="submit"
          disabled={pending}
          className="flex-shrink-0 rounded bg-av-blue px-4 py-2 text-[13px] font-medium text-av-paper transition-colors hover:bg-av-blue-hover disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </form>
  );
}
