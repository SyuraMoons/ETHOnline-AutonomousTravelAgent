// Shared "getting started" prompts — used by both the hero's template chips
// (marketing/PromptTemplates.tsx) and the /plan rail's chips (plan/SuggestionChips.tsx),
// plus the navigation helper both surfaces use to hand a brief to /plan's agent rail.
import type { useRouter } from "next/navigation";
import { CoinIcon, FaceScanIcon, MapPinIcon, PlaneIcon } from "./ui/icons";

type Router = ReturnType<typeof useRouter>;

export const SUGGESTIONS = [
  {
    icon: PlaneIcon,
    label: "3 nights in Tokyo from Jakarta in November, for 2",
    brief: "Plan a 3-night trip to Tokyo from Jakarta in November for 2 travellers.",
  },
  {
    icon: MapPinIcon,
    label: "A weekend in Singapore from Yogyakarta, 3 of us",
    brief: "Find me a weekend trip from Yogyakarta to Singapore next month for 3 travellers.",
  },
  {
    icon: CoinIcon,
    label: "Somewhere warm under $600 per person",
    brief: "Suggest somewhere warm I can fly to from Jakarta for under $600 per person.",
  },
  {
    icon: FaceScanIcon,
    label: "What can you book without asking me?",
    brief: "What can you book on your own, and what needs my approval?",
  },
];

/** Navigate to /plan (whose agent rail shows the conversation) with `brief` attached,
 * routing through /login first (with a `next` back to that same /plan?brief= URL) when the
 * wallet isn't connected yet. Shared by the hero prompt card and its template chips so the
 * two paths can't drift. */
export function startBrief(router: Router, brief: string, isConnected: boolean) {
  const trimmed = brief.trim();
  if (!trimmed) return;
  const planUrl = `/plan?brief=${encodeURIComponent(trimmed)}`;
  if (!isConnected) {
    router.push(`/login?next=${encodeURIComponent(planUrl)}`);
    return;
  }
  router.push(planUrl);
}
