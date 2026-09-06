# AutoVoyage Frontend — Progress Tracker

> Track what's built vs. pending. UI-first: we build the screens now; backend integration
> (wallet, World ID, x402, plan/audit APIs) is wired later — see [`INTEGRATION.md`](./INTEGRATION.md).
> Location: `packages/nextjs` (currently under `FRONTEND/packages/nextjs`). Design source: Figma
> `bOAHzbAn1loghbwWw38hpf`.

Legend: `[x]` done · `[~]` in progress · `[ ]` not started

## Foundations
- [x] AutoVoyage design tokens in `styles/globals.css` `@theme` (`av-*` colors, `--font-mono`)
- [x] `(marketing)` route-group layout — Rubik + JetBrains Mono, mono/clay system
- [x] Brand: `WaypointLogo`, `Wordmark`
- [x] Shared inline icons (`ui/icons.tsx`) — no lucide dependency
- [x] `(app)` route-group layout — light/blue product shell + Sidebar (nav, budget meter, current trip, Connect wallet)
- [x] Shared fonts module (`utils/autovoyage/fonts.ts`), StatusPill, app icons (compass/pulse/shield/send/plus/check/…)
- [ ] More UI primitives as needed (Button, Chip, Card, Field)

## Landing page (`/` → `app/(marketing)/page.tsx`, Figma 72:2)
Built top-down:
- [x] **1. Hero** (light paper + video, blue identity) — nav, eyebrow, headline, subtitle, glass prompt card, trust strip
- [x] **2. ScreenshotSection** — "Your trip, planned and paid, in one view." + product shot (Trip Plan)
- [x] **3. FeatureRow ×3** — Boundaries (BudgetCard) / Autonomy (AgentActivityCard) / Human control (ApprovalCard); alternating band bg
- [x] **4. HowItWorks** — 01 / 02 / 03 numbered rows
- [x] **5. SponsorBand** — dark "Real autonomous agent commerce, not a demo wrapper." (3 rails)
- [x] **6. FooterCta** — "Hand over the busywork. Keep the control." + Get started / Talk to us + slim footer

**Landing page: all six sections built.** Remaining = polish (below).

Landing polish:
- [ ] Product screenshot / feature-card visuals (export from Figma or rebuild as components)
- [ ] Responsive pass (mobile nav, card widths, type scale)
- [ ] `/design-critique` + `/accessibility-review`
- [ ] Replace any placeholder media; own the hero video if we add one

## Other screens (design-first, all in Figma)
- [x] Login (`/login`, node 77:142) — left brand panel (collage calmed: desaturated + ink scrim, with LIVE wordmark + headline) + dark sign-in card (email, Google/Github, Connect wallet). All auth is placeholder.
- [x] Trip Plan (`/plan`, node 188:315) — sidebar shell + agent-progress card, Flights (auto-approved), Stay (needs-approval gate), Activities pace picker, agent chat panel. **Data-driven**: all values come from `services/autovoyage/tripData.ts` (mock now → swap for the scraped dataset/`/api/plan`; types in `types/autovoyage/plan.ts`, formatting in `services/autovoyage/currency.ts`). Components are pure, nothing hardcoded.
- [x] Approval (`/approve`, node 31:146) — over-limit face-check gate + agent panel ("Waiting for you to verify"). Data-driven (getApproval). [INTEGRATION] Verify → World ID + execute.
- [x] Booking Confirmed (node 211:2) — success modal over the dimmed plan at `/plan?booked=1` (green chip, summary, Total paid, booking ref, on-chain + World ID proof rows). Data-driven (getBooking).
- [x] Itinerary (`/itinerary`, node 295:605) — read-only booked trip, payment breakdown, on-chain proof, Back to plan / Download itinerary. Data-driven (getBooking).
- [x] Flow wired end-to-end: Plan → Approve → Confirmed → Itinerary (client-side links).
- [x] Shared: `OnChainProof` (HCS + World ID proof rows), `ApprovalFocus`, `BookingConfirmedModal`; `FlightRow` gained `readOnly`, `AgentPanel` gained `statusNote`.
- [x] x402 Activity Feed (`/activity`, node 48:207) — stat tiles + streamed x402/on-chain event feed (StatTile, X402ActivityRow). Data-driven (getActivityFeed).
- [x] Audit Trail (`/audit`, node 49:222) — All/Payments/Approvals filter over the HCS event log (AuditList). Data-driven (getAuditTrail).
- [x] Chat (`/chat`, node 27:90) — full-screen agent conversation (user/agent bubbles, inline flight-result cards, pinned composer) + centered approval overlay on `?approve=1` (reuses ApprovalFocus). Data-driven (getChat).
- [x] Wallet Connect (node 301:652) — wallet-picker overlay (MetaMask/WalletConnect/Coinbase), opened from the sidebar "Connect wallet". Placeholder rows; **must connect to the real wallet (Reown AppKit / HashPack) in the integration pass** — x402 needs the wallet to sign.

**All Figma screens are built.** Remaining work is the integration pass (auth + wallet + World ID + x402), not new screens.

## Integration (later — tracked in INTEGRATION.md)
- [~] Login auth (Google / GitHub / email via Auth.js + HashPack via Reown) — **setup guide written**
      (`AUTH-SETUP.md`); waiting on credentials, then implement. Auth.js not yet installed.
- [ ] Wallet connect (HashPack / Reown) on Login + nav
- [ ] World ID selfie check on the Approval gate
- [ ] Plan stream (`/api/plan` SSE) behind the hero "Plan My Trip"
- [ ] Audit / registry reads
- [ ] `.env` keys populated (World ID, WalletConnect, facilitator, LLM)

## Quality pass (done)
- [x] Comments cleaned — every AutoVoyage `.ts`/`.tsx` (50 files) now has a single top label
      (e.g. `// Landing page`); verbose JSDoc + inline `[INTEGRATION]` comments removed. Swap points
      are documented in `INTEGRATION.md`; stub handlers log `console.info("[AutoVoyage] …`.
- [x] All routes recompiled clean (HTTP 200, no errors) after the strip.
- [x] Buttons: full prototype flow is clickable (Landing → Login → any sign-in → Plan → Approve →
      Confirmed → Itinerary; Chat ⟷ panel; Wallet modal; Audit filter; sidebar nav). Remaining
      inert placeholders (feature-level, pending integration): flight "Change", activity "+ Add",
      chat "Select", "Download itinerary", chat/agent "Send".
- [x] Performance: warm routes serve in ~0.26–0.36s; only dev first-compile is slower (prod build
      is instant). App is lightweight — no heavy lists/loops; images via next/image.

## Run locally
- Frontend workspace folder renamed `packages/nextjs` → **`packages/frontend`** (workspace name
  stays `@sh/nextjs`; scripts unchanged). Root workspaces path updated. `packages/` is back at the
  repo root (docker/hardhat/supplier/contracts intact).
- Landing renders and the hero is verified live. To run:
  ```bash
  cd packages/frontend && npx next dev -p 3010 -H 127.0.0.1
  ```
- Gotchas on this machine: **port 3000 is taken by postgres**, so use another port (3010). And use
  **127.0.0.1**, not `localhost` (Windows resolves localhost to IPv6 ::1; Next binds IPv4).
- Root layout was slimmed: wallet/x402 providers + scaffold Header/Footer are no longer global —
  they belong to the `(app)` group. Marketing renders provider-free (no wallet env needed).

## Known follow-ups / debt
- [x] Monorepo runnable again: `packages/` back at repo root; frontend at `packages/frontend`.
- [ ] FRONTEND docs (this file + INTEGRATION.md + FRONTEND.md) are currently loose in the
      workspace root `ETH GLOBAL 2026/`, not in the repo. Decide a home (recommend
      `ETHOnline-AutonomousTravelAgent/FRONTEND/`) so a clone includes them. A stray copy also sits
      in `Claude outputs/`.
- [ ] ~18 files still say `packages/nextjs` (docs: RUNBOOK/README/AGENTS; `.lintstagedrc.js`;
      `.gitignore`; supplier comments). Update the functional ones + docs.
- [ ] Removed scaffold `app/page.tsx` so the landing owns `/` (recoverable from git history).
- [ ] `styles/tokens.css` from FRONTEND.md was folded into `globals.css @theme` for Tailwind v4
      reliability; extract later if we want a standalone token file.
- [ ] Own the hero video (currently the Figma-hosted placeholder).

_Last updated: hero complete and verified live at 127.0.0.1:3010._
