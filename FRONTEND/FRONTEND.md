# AutoVoyage — Frontend Structure

> How the AutoVoyage frontend is organized, written before feature coding starts so the layout
> and conventions are settled first. The frontend **is `packages/nextjs`** (Next.js 15, App
> Router) — not a separate app. This document extends `ARCHITECTURE.md` (system) and `DESIGN.md`
> (brand/tokens); read those first. Nothing here overrides the rules in `RULES.md`.

## 1. Why here (not a separate Vite app)

The Next.js app already owns the pieces the frontend depends on: the API route handlers
(`app/api/plan`, `execute`, `consent`, `mandate`, `audit`, `registry`), the x402 client/server
plumbing (`services/x402/*`), and the Hedera wallet connect (`services/web3/*`). A separate Vite
frontend would orphan all of that. So AutoVoyage UI is built **inside `packages/nextjs`**, as a
feature layer on top of the existing Scaffold-HBAR plumbing.

The landing hero was specced in Vite (`autovoyage-hero-prompt.md`); it is **adapted to Next.js**
here — same markup, tokens, and lucide-react icons, but as an App-Router route + components. No
Vite, no second build.

## 2. Two design systems = two route groups

`DESIGN.md` defines two systems: mono ink/clay **marketing** (landing + login) and light+blue
**app**. Next.js route groups give each its own `layout.tsx` (fonts, shell, theme) without
affecting the URL:

- `app/(marketing)/` — mono ink/clay editorial system; the landing hero + login.
- `app/(app)/` — light+blue product system; the sidebar-shell screens.

## 3. Directory tree

Legend: **[new]** = AutoVoyage code to write · **[keep]** = existing Scaffold-HBAR, leave as-is.

```
packages/nextjs/
├─ app/
│  ├─ layout.tsx                 [keep→edit]  root layout: fonts (Rubik, JetBrains Mono), providers
│  ├─ globals.css                [keep→edit]  Tailwind directives + token imports
│  ├─ (marketing)/               [new]  mono ink/clay system
│  │  ├─ layout.tsx              [new]  marketing shell (paper bg, marketing nav)
│  │  ├─ page.tsx                [new]  Landing (hero: video + glass prompt card + trust strip)
│  │  └─ login/page.tsx          [new]  Login (passwordless + connect wallet)
│  ├─ (app)/                     [new]  light+blue product system
│  │  ├─ layout.tsx              [new]  AppShell = sidebar (nav, budget, wallet) + content slot
│  │  ├─ plan/page.tsx           [new]  Trip Plan (main dashboard)
│  │  ├─ itinerary/page.tsx      [new]  Itinerary (booked trip)
│  │  ├─ activity/page.tsx       [new]  x402 Activity Feed
│  │  ├─ audit/page.tsx          [new]  Audit Trail
│  │  └─ chat/page.tsx           [new]  Full-screen agent chat
│  └─ api/                       [keep→build]  route handlers (see ARCHITECTURE.md §8)
├─ components/
│  ├─ autovoyage/                [new]  ALL AutoVoyage UI lives here
│  │  ├─ ui/                     primitives: Button, Chip, StatusPill, Card, Field (flat, 4px)
│  │  ├─ brand/                  Logo (Waypoint SVG), Wordmark
│  │  ├─ marketing/              Hero, GlassPromptCard, TrustStrip, MarketingNav, FeatureRow
│  │  ├─ layout/                 Sidebar, AppShell, TopProgress (agent step card)
│  │  ├─ plan/                   PlanSection, FlightCard, StayCard, ActivityPicker, PaceToggle
│  │  ├─ approval/               ApprovalGate, ConfirmCheck, BookingConfirmed (overlay)
│  │  ├─ wallet/                 ConnectWalletButton, WalletModal
│  │  ├─ activity/               X402ActivityRow, StatTile
│  │  ├─ audit/                  AuditRow, ProofRow
│  │  └─ chat/                   ChatPanel, MessageBubble, Composer
│  └─ scaffold-hbar/             [keep]  scaffold wallet button, etc. — do not restyle
├─ hooks/
│  ├─ autovoyage/                [new]  usePlanStream (SSE), useMandate, useConsent, useAudit
│  └─ scaffold-hbar/             [keep]
├─ services/
│  ├─ autovoyage/                [new]  planClient, auditClient, currency (USD/USDC/HBAR format)
│  ├─ x402/                      [keep]  x402 client/server plumbing
│  ├─ web3/                      [keep]  Hedera wallet connect (Reown/HashPack)
│  └─ store/                     [keep→extend]  zustand stores (add plan/mandate state)
├─ styles/
│  └─ tokens.css                 [new]  CSS variables for both design systems (single source)
├─ types/
│  └─ autovoyage/                [new]  FE types; import zod types from @sh/contracts where possible
├─ public/
│  ├─ brand/                     [new]  logo assets, favicons
│  └─ video/                     [new]  hero clip + poster frame (own it; not the Figma placeholder)
├─ contracts/                    [keep]  generated deployedContracts.ts (do not hand-edit)
├─ scripts/                      [keep]  x402-buy.ts, etc.
└─ FRONTEND/                     [new]  this documentation folder (FRONTEND.md + README.md)
```

## 4. Screen → file map

| Figma screen | Route | Primary components |
| --- | --- | --- |
| Landing | `app/(marketing)/page.tsx` | `marketing/Hero`, `GlassPromptCard`, `TrustStrip`, `MarketingNav` |
| Login | `app/(marketing)/login/page.tsx` | `wallet/ConnectWalletButton`, `WalletModal` |
| Trip Plan | `app/(app)/plan/page.tsx` | `layout/AppShell`, `TopProgress`, `plan/PlanSection`, `FlightCard`, `StayCard`, `ActivityPicker` |
| Approval + Booking Confirmed | overlay in `(app)` (or `plan` with state) | `approval/ApprovalGate`, `ConfirmCheck`, `BookingConfirmed` |
| Itinerary | `app/(app)/itinerary/page.tsx` | `plan/PlanSection` (read-only), `audit/ProofRow` |
| x402 Activity Feed | `app/(app)/activity/page.tsx` | `activity/X402ActivityRow`, `StatTile` |
| Audit Trail | `app/(app)/audit/page.tsx` | `audit/AuditRow` |
| Chat | `app/(app)/chat/page.tsx` | `chat/ChatPanel`, `MessageBubble`, `Composer` |

## 5. Conventions

- **Components:** PascalCase files, one component per file, co-locate a component with its subparts
  in its feature folder. Feature folders are the unit of organization, not a flat `components/`.
- **Design tokens, not hardcoded values.** Colors/spacing/radii come from `styles/tokens.css` +
  the Tailwind theme (see `DESIGN.md §4`). No raw hex in components except where a token genuinely
  does not exist yet — then add the token.
- **Radius:** 4px everywhere; the hero glass card + its CTA are the only pill/`44px` exception
  (`DESIGN.md §5`).
- **No status dots** (`DESIGN.md §6`): pill + label, not colored dots. Green only on Booking
  Confirmed.
- **Currency formatting** lives in `services/autovoyage/currency.ts`: USD for trip prices, USDC for
  the agent's x402 spend (HBAR is the bridge underneath — see `ARCHITECTURE.md §4`). One formatter,
  used everywhere, so the model stays consistent.
- **Types come from `@sh/contracts`** (the shared zod schemas) wherever a shape crosses the
  client/server boundary — do not redefine mandate/plan/audit shapes in the frontend.
- **Data flow:** server state via TanStack Query; the plan stream via `hooks/autovoyage/usePlanStream`
  (SSE); local UI state via zustand (`services/store`). Do not put money or prices in client-only
  state that the server must trust.
- **Don't restyle `scaffold-hbar/`** — it's plumbing. Wrap it if you need a branded surface.

## 6. Design-first reminder

Per `RULES.md` (ADR-008), a page gets built here only after it exists in Figma. Every route in the
tree above maps to a screen already in the Figma file (`bOAHzbAn1loghbwWw38hpf`) except any marked
as future — do not add routes for undesigned pages.

## 7. Related

- `ARCHITECTURE.md` — routes, x402/HBAR, data flow.
- `DESIGN.md` — tokens, the two systems, screen inventory.
- `RULES.md` — conventions, design-first, dependency rules.
- `autovoyage-hero-prompt.md` — the hero spec (adapt Vite → Next here).

> Note: `ARCHITECTURE.md`, `DESIGN.md`, `RULES.md`, and `autovoyage-hero-prompt.md` live in the
> workspace folder one level above this repo (`ETH GLOBAL 2026/`), alongside `RaybanBuildSpec.md`.
> They are planning docs kept outside the tracked repo tree.
