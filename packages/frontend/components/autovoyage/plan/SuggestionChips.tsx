"use client";

// Kayak's "Getting started" prompts. Each chip is just a brief — it goes through
// the same sendBrief() the agent rail uses, so clicking one is indistinguishable
// from typing it.
import { SUGGESTIONS } from "../prompts";
import { usePlan } from "./PlanProvider";

export function SuggestionChips() {
  const { sendBrief, pending } = usePlan();

  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-av-muted">Getting started</span>
      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map(({ icon: Icon, label, brief }) => (
          <button
            key={label}
            type="button"
            disabled={pending}
            onClick={() => void sendBrief(brief)}
            className="flex items-center gap-2 rounded border border-av-border bg-av-card px-3 py-2 text-left text-[13px] font-medium text-av-text transition-colors hover:border-av-blue hover:bg-av-blue-tint hover:text-av-blue disabled:opacity-50"
          >
            <Icon size={15} className="flex-shrink-0 text-av-muted" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
