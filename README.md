# AutoVoyage — Frontend (`Frontend` branch)

> **This branch is for reviewing the AutoVoyage frontend.** All the UI lives in
> [`packages/frontend`](packages/frontend); the docs are in [`FRONTEND/`](FRONTEND). The other
> packages (`contracts`, `hardhat`, `supplier`, `facilitator`) are the backend, carried over from
> `main` and **not part of this review**.

**AutoVoyage** is a risk-aware autonomous travel agent: it plans a trip, pays for data on its own
via **Hedera x402**, and **pauses for a World ID face check** before anything over your spending
limit — with every action written to an on-chain audit trail. This branch is the **frontend only**;
the payment/verification backend is a separate, later effort.

---

## Run it locally

```bash
# from the repo root
npm install
npm run next:dev
```

Then open **http://localhost:3000**.

> If port 3000 is busy on your machine, run it on another port:
> `cd packages/frontend && npx next dev -p 3010` → open `http://127.0.0.1:3010`.
> (Node 20+ required. The dev server needs internet the first time — fonts load via `next/font`.)

## What's built

Every screen from the Figma is implemented and clickable. Try this flow:

**Landing → Get started → (any sign-in) → Trip Plan → Review & approve → Verify to confirm →
Booking Confirmed → View itinerary.**

| Screen | Route |
| --- | --- |
| Landing | `/` |
| Login | `/login` |
| Trip Plan (main dashboard) | `/plan` |
| Booking Confirmed (modal) | `/plan?booked=1` |
| Itinerary | `/itinerary` |
| x402 Activity Feed | `/activity` |
| Audit Trail | `/audit` |
| Chat (full-screen agent) | `/chat` |
| Wallet Connect | sidebar → **Connect wallet** |

## How the code is organized

```
packages/frontend/
├─ app/
│  ├─ (marketing)/        Landing + Login (mono ink/clay system)
│  └─ (app)/              Product screens (light + blue system) + sidebar shell
├─ components/autovoyage/ All AutoVoyage UI, grouped by feature
│  ├─ marketing/ brand/ ui/ layout/ plan/ activity/ audit/ chat/ wallet/
├─ services/autovoyage/
│  ├─ tripData.ts         ← THE data layer (mock now; swap for the real API/dataset)
│  └─ currency.ts         USD / USDC formatting
├─ types/autovoyage/      view-model types
└─ styles/globals.css     Tailwind v4 tokens (av-* design tokens)
```

Each file has a one-line label at the top (e.g. `// Trip Plan page`).

## Data-driven — where the real data plugs in

The product screens **don't hardcode data**; components take typed props and render whatever the
data layer returns. The single place to swap mock → real is **`services/autovoyage/tripData.ts`**
(`getTripPlan`, `getBooking`, `getActivityFeed`, …). Replace those function bodies with the real
`/api/plan` result built from the scraped flight dataset and every screen updates — components
don't change. Money is stored in **minor units (USD cents)** and formatted only at the UI edge.

## Not wired yet (integration is the next phase)

These buttons render but are **intentional stubs** — the real wiring is documented, not done:

- **Connect wallet** (HashPack via Reown AppKit) — the essential one for x402 payments
- **World ID** face check, and the **Hedera x402** payment/audit backend (NOT IMPLEMENTED -- FINAL)

Full map of every integration point: [`FRONTEND/INTEGRATION.md`](FRONTEND/INTEGRATION.md).
Build status / checklist: [`FRONTEND/PROGRESS.md`](FRONTEND/PROGRESS.md).

## Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 (CSS-first tokens) ·
Rubik + JetBrains Mono. No component library — icons are inline SVG.

## More docs

- [`FRONTEND/README.md`](FRONTEND/README.md) — frontend orientation
- [`FRONTEND/FRONTEND.md`](FRONTEND/FRONTEND.md) — full structure + conventions
- [`FRONTEND/INTEGRATION.md`](FRONTEND/INTEGRATION.md) — where the backend/keys plug in
- [`FRONTEND/AUTH-SETUP.md`](FRONTEND/AUTH-SETUP.md) — how to provision Google/GitHub/wallet credentials
