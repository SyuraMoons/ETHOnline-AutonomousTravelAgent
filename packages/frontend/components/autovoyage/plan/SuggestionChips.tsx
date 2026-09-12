"use client";

// Kayak's "Getting started" prompts. Each chip fills the composer via onSelect —
// the same as typing it by hand — rather than sending immediately.
import { DEV_TEST_SUGGESTIONS, SUGGESTIONS } from "../prompts";
import { usePlan } from "./PlanProvider";

// Outside production, swap in the broader dev-only test templates (full itineraries +
// a refusal case) — see prompts.ts. Marketing's PromptTemplates.tsx always uses SUGGESTIONS.
const suggestions = process.env.NODE_ENV !== "production" ? DEV_TEST_SUGGESTIONS : SUGGESTIONS;

export function SuggestionChips({ onSelect }: { onSelect: (brief: string) => void }) {
  const { pending } = usePlan();

  return (
    <div className="flex flex-col gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-av-muted">Getting started</span>
      <div className="flex flex-wrap gap-2">
        {suggestions.map(({ icon: Icon, label, brief }) => (
          <button
            key={label}
            type="button"
            disabled={pending}
            onClick={() => onSelect(brief)}
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
