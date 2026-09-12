"use client";

// Hero template chips — same SUGGESTIONS list and navigation as the /plan rail's
// SuggestionChips, so clicking one here is indistinguishable from typing that brief
// into the prompt card.
import { useRouter } from "next/navigation";
import { SUGGESTIONS, startBrief } from "../prompts";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";

export function PromptTemplates() {
  const router = useRouter();
  const { isConnected } = useHederaWalletConnect();

  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {SUGGESTIONS.map(({ icon: Icon, label, brief }) => (
        <button
          key={label}
          type="button"
          onClick={() => startBrief(router, brief, isConnected)}
          className="flex items-center gap-2 rounded-full border border-white/70 bg-white/[0.06] px-3.5 py-2 text-[13px] font-medium text-av-text backdrop-blur-[14px] transition-colors hover:border-av-blue hover:text-av-blue"
        >
          <Icon size={15} className="flex-shrink-0" />
          {label}
        </button>
      ))}
    </div>
  );
}
