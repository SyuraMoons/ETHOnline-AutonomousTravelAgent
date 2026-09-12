// Shared "getting started" prompts — used by both the hero's template chips
// (marketing/PromptTemplates.tsx) and the /plan rail's chips (plan/SuggestionChips.tsx),
// plus the navigation helper both surfaces use to hand a brief to /plan's agent rail.
import type { useRouter } from "next/navigation";
import { CoinIcon, FaceScanIcon, MapPinIcon, PlaneIcon } from "./ui/icons";

type Router = ReturnType<typeof useRouter>;

// These briefs are deliberately pinned to routes/dates present in the supplier's
// static inventory (data/cache/flights.json, bookable window 2026-09-14–2026-09-28)
// so a tester's demo run can actually reach booking, not a generated (unbookable)
// fallback offer. See AGENTS.md "Not yet built" / packages/supplier/src/lib/inventory.ts.
export const SUGGESTIONS = [
  {
    icon: PlaneIcon,
    label: "Round trip: Jakarta → Bali, Sep 20–24, 2 pax",
    brief:
      "Plan a round trip from Jakarta to Bali (Denpasar), departing September 20 2026 and returning September 24 2026, for 2 travellers.",
  },
  {
    icon: MapPinIcon,
    label: "One-way: Jakarta → Tokyo Haneda, Sep 18, 2 pax",
    brief: "Find me a one-way flight from Jakarta to Tokyo Haneda (HND) on September 18 2026 for 2 travellers.",
  },
  {
    icon: CoinIcon,
    label: "One-way: Bangkok → Singapore, Sep 15, 4 pax",
    brief: "Search flights from Bangkok to Singapore on September 15 2026 for 4 travellers.",
  },
  {
    icon: FaceScanIcon,
    label: "One-way: Singapore → Sydney, Sep 22, 2 pax",
    brief: "Search flights from Singapore to Sydney on September 22 2026 for 2 travellers.",
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
