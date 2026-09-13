"use client";

// Glass prompt card
import { type ChangeEvent, type KeyboardEvent, type RefObject, useRef } from "react";
import { useRouter } from "next/navigation";
import { startBrief } from "../prompts";
import { UploadIcon } from "../ui/icons";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";
import { notification } from "~~/utils/scaffold-hbar";

// Pinned to a route/date pair present in the supplier's static inventory (see
// components/autovoyage/prompts.ts) so a tester who types close to this placeholder
// still lands on a bookable itinerary.
const EXAMPLE_PROMPT =
  "Plan a round trip from Jakarta to Bali (Denpasar), departing September 20 2026 and returning September 24 2026, for 2 travellers....";

export function GlassPromptCard({
  brief,
  onBriefChange,
  textareaRef,
}: {
  brief: string;
  onBriefChange: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { isConnected } = useHederaWalletConnect();

  const handleSubmit = () => {
    if (!brief.trim()) return;
    if (!isConnected) notification.error("Please log in / connect your wallet first.");
    startBrief(router, brief, isConnected);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    console.info("[AutoVoyage] File selected:", e.target.files?.[0]?.name);
  };

  return (
    <div className="relative w-full max-w-[701px] overflow-hidden rounded-[44px] border-[3px] border-white bg-white/[0.06] shadow-[0_0_4px_0_rgba(0,0,0,0.15)] backdrop-blur-[20px]">
      <div className="flex min-h-[208px] flex-col p-6">
        <label htmlFor="trip-brief" className="sr-only">
          Describe your trip
        </label>
        <textarea
          id="trip-brief"
          ref={textareaRef}
          value={brief}
          onChange={e => onBriefChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={EXAMPLE_PROMPT}
          rows={2}
          className="w-full flex-1 resize-none border-none bg-transparent text-[17px] font-medium leading-relaxed text-av-blue outline-none placeholder:text-av-blue/70 md:text-xl"
        />
        <div className="mt-4 flex items-end justify-between">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload inspiration"
            className="flex h-11 w-11 items-center justify-center rounded-full border border-white/70 text-av-text backdrop-blur-[14px] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <UploadIcon size={18} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFiles} />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!brief.trim()}
            className="flex h-14 w-[156px] items-center justify-center rounded-full bg-av-blue text-base font-medium uppercase tracking-[0.02em] text-av-paper transition-all hover:bg-av-blue-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Plan My Trip
          </button>
        </div>
      </div>
    </div>
  );
}
