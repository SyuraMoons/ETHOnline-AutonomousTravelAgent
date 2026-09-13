"use client";

// Hero template chips — same SUGGESTIONS list as the /plan rail's SuggestionChips.
// Clicking one fills the prompt card's textarea (via onSelect), the same as typing
// it by hand — it never submits on its own.
import { SUGGESTIONS } from "../prompts";

export function PromptTemplates({ onSelect }: { onSelect: (brief: string) => void }) {
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {SUGGESTIONS.map(({ icon: Icon, label, brief }) => (
        <button
          key={label}
          type="button"
          onClick={() => onSelect(brief)}
          className="flex items-center gap-2 rounded-full border border-white/70 bg-white/[0.06] px-3.5 py-2 text-[13px] font-medium text-av-text backdrop-blur-[14px] transition-colors hover:border-av-blue hover:text-av-blue"
        >
          <Icon size={15} className="flex-shrink-0" />
          {label}
        </button>
      ))}
    </div>
  );
}
