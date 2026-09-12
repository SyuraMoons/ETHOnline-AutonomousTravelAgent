// Shared "getting started" prompts — used by both the hero's template chips
// (marketing/PromptTemplates.tsx) and the /plan rail's chips (plan/SuggestionChips.tsx),
// plus the navigation helper both surfaces use to hand a brief to /plan's agent rail.
import type { useRouter } from "next/navigation";
import { CoinIcon, FaceScanIcon, MapPinIcon, PlaneIcon } from "./ui/icons";

type Router = ReturnType<typeof useRouter>;

// These briefs are deliberately pinned to routes/dates present in the supplier's
// static inventory (data/cache/flights.json, bookable window 2026-11-07–2026-11-21 as of
// seed 20260910) so a tester's demo run can actually reach booking, not a generated
// (unbookable) fallback offer. If these go stale again, re-check
// data/cache/flights.meta.json for the live window rather than trusting this comment —
// it's regenerated whenever packages/supplier/scripts/scrape-flights.ts reruns with a new
// seed. See AGENTS.md "Not yet built" / packages/supplier/src/lib/inventory.ts.
export const SUGGESTIONS = [
  {
    icon: PlaneIcon,
    label: "Round trip: Jakarta → Bali, Nov 10–14, 2 pax",
    brief:
      "Plan a round trip from Jakarta to Bali (Denpasar), departing November 10 2026 and returning November 14 2026, for 2 travellers.",
  },
  {
    icon: MapPinIcon,
    label: "One-way: Jakarta → Tokyo Haneda, Nov 12, 2 pax",
    brief: "Find me a one-way flight from Jakarta to Tokyo Haneda (HND) on November 12 2026 for 2 travellers.",
  },
  {
    icon: CoinIcon,
    label: "One-way: Bangkok → Singapore, Nov 15, 4 pax",
    brief: "Search flights from Bangkok to Singapore on November 15 2026 for 4 travellers.",
  },
  {
    icon: FaceScanIcon,
    label: "One-way: Singapore → Sydney, Nov 18, 2 pax",
    brief: "Search flights from Singapore to Sydney on November 18 2026 for 2 travellers.",
  },
];

// Dev-only templates for local testing — deliberately broader than SUGGESTIONS above
// (full itineraries with a stay + activity, plus one edge case), so a local tester can
// exercise the whole plan → mandate check → pay → results pipeline in one click instead of
// typing multi-part briefs by hand. Rendered only in the /plan rail (SuggestionChips.tsx),
// never on the marketing hero — see that file's NODE_ENV gate. Also pinned to the
// 2026-11-07–2026-11-21 cached flight window; see the comment on SUGGESTIONS above.
export const DEV_TEST_SUGGESTIONS = [
  {
    icon: PlaneIcon,
    label: "Full trip: Jakarta ⇄ Singapore + hotel + food, Nov 10–14",
    brief:
      "Plan a round trip from Jakarta to Singapore, departing November 10 2026 and returning November 14 2026, for 2 travellers, with a hotel in Singapore for those dates and a food activity.",
  },
  {
    icon: MapPinIcon,
    label: "Full trip: Singapore ⇄ Tokyo + hotel + culture, Nov 12–16",
    brief:
      "Plan a round trip from Singapore to Tokyo (NRT), departing November 12 2026 and returning November 16 2026, for 2 travellers, with a hotel in Tokyo and a culture activity.",
  },
  {
    icon: FaceScanIcon,
    label: "Full trip: Singapore ⇄ Sydney + hotel + nature, Nov 18–21",
    brief:
      "Plan a round trip from Singapore to Sydney, departing November 18 2026 and returning November 21 2026, for 2 travellers, with a hotel in Sydney and an adventurous nature activity.",
  },
  {
    icon: CoinIcon,
    label: "Smoke test: Bangkok → Singapore, Nov 15, 4 pax",
    brief: "Search flights from Bangkok to Singapore on November 15 2026 for 4 travellers.",
  },
  {
    icon: PlaneIcon,
    // Largest pax count on one of the pricier cached routes, meant to blow past the
    // default mandate ceilings and exercise the refusal path (per_tx_ceiling_exceeded /
    // total_ceiling_exceeded). Whether it actually refuses depends on the local .env's
    // AGENT_MANDATE_PER_TX_HBAR / AGENT_MANDATE_TOTAL_HBAR — raise the pax count if it
    // doesn't trip a refusal locally.
    label: "Refusal test: Singapore ⇄ Tokyo, 12 pax (over budget)",
    brief:
      "Plan a round trip from Singapore to Tokyo (NRT) for 12 travellers, departing November 12 2026 and returning November 16 2026.",
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
