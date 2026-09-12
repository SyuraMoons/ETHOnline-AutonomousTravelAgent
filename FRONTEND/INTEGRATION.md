# AutoVoyage Frontend — Integration Points

> Where the backend/API wiring plugs into the UI, and **where the keys go**. The UI is built
> first; nothing here is connected yet. The inline `// [INTEGRATION]` comments were removed in the
> comment-cleanup pass, so **this doc (the maps below) is the source of truth** for where the
> backend plugs in. Stub click handlers still log to the console — find them with:
>
> ```bash
> grep -rn 'console.info("\[AutoVoyage\]' packages/frontend
> ```

## Where the keys go (never commit real values)

Keys live in **`.env` files**, never in components or in git. Templates are the `.env.example`
files (root, `packages/nextjs`, `facilitator`). Copy them to `.env` / `.env.local` and fill in.

| What | Env var | File | Exposed to browser? |
| --- | --- | --- | --- |
| WalletConnect / HashPack (Reown) project id | `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | `packages/nextjs/.env` | Yes (`NEXT_PUBLIC_`) |
| Execution token secret | `EXECUTION_TOKEN_SECRET` | `packages/nextjs/.env` | **No — server only** |
| LLM key (brief parsing) | `ANTHROPIC_API_KEY` | `packages/nextjs/.env` | **No — server only** |
| x402 facilitator URL | `FACILITATOR_URL` | `packages/nextjs/.env` | server-side |
| HCS topic ids | `HCS_REGISTRY_TOPIC_ID`, `HCS_AUDIT_TOPIC_ID` | `packages/nextjs/.env` | server-side |
| Facilitator fee-payer (ECDSA) | `FACILITATOR_ACCOUNT_ID`, `FACILITATOR_PRIVATE_KEY` | root `.env` / `facilitator/.env` | **Never in the app or browser** |

Rule of thumb: only `NEXT_PUBLIC_*` vars reach the browser. Anything secret (execution-token
secret, LLM key, the facilitator private key) is used **only in `app/api/*` route handlers**,
never imported into a client component.

## Data layer — the swap point for the scraped dataset

The product `(app)` screens are **data-driven**: components take typed props and render whatever
the data layer returns — nothing is hardcoded in the UI. The single place to swap mock → real is:

- **`services/autovoyage/tripData.ts`** — `getTripPlan()` and `getCurrentTripContext()`. They
  currently return fixtures; replace the bodies with the real source (the `/api/plan` result built
  from the scraped flight dataset — `data/cache/flights.json` / your friend's scraper) and keep the
  return types identical. View-model types live in `types/autovoyage/plan.ts`.
- Money is in **minor units (USD cents)**; format only at the UI edge via
  `services/autovoyage/currency.ts` (`formatUsd`, `formatUsdc`).
- When aligning source shapes, map the scraped `SearchResult` (offerId, airline, departUtc,
  priceMinor, currency, …) → `FlightLeg`. Align with `@sh/contracts` once it's wired in.

So plugging in the real data touches one file (`tripData.ts`), not the components.

## UI → backend hookup map

| UI element (file) | Placeholder now | Wire to (later) |
| --- | --- | --- |
| Hero "Plan My Trip" (`marketing/GlassPromptCard.tsx`) | `console.info` in `handleSubmit` | `usePlanStream` → `POST /api/plan` (SSE); requires auth + mandate first |
| Hero upload button (`GlassPromptCard.tsx`) | `console.info` in `handleFiles` | attachment/inspiration parsing (future) |
| Nav "Log in" / "Get started" (`marketing/MarketingNav.tsx`) | links to `/login` | auth + wallet connect on the Login screen |
| Wallet connect (Login screen — not built) | — | Reown AppKit / HashPack (`services/web3/*`, `hedera` namespace) |
| Booking confirm (Approval gate — not built) | — | `POST /api/consent/initiate` + `/verify`, signal = itinerary hash |
| Budget meter / plan cards (`/plan` — not built) | — | plan data from `/api/plan`; types from `@sh/contracts` |
| Audit rows (`/audit` — not built) | — | `GET /api/audit/:planId` via Mirror Node |

## Conventions when wiring (from the docs)

- Types crossing client/server come from **`@sh/contracts`** — don't redefine mandate/plan/audit
  shapes in the frontend.
- Money is **tinybars** server-side; the UI formats via `services/autovoyage/currency.ts`
  (USD trip prices, USDC agent spend, HBAR bridge underneath). Do not put trusted money/prices in
  client-only state.
- The itinerary hash is recomputed **server-side**; never trust a client-sent hash.

## Blocker to running the app

The frontend currently can't `npm run dev` because `packages/` was moved under `FRONTEND/` while
the root `package.json` workspaces still point at `packages/*`. Before running: either move
`packages/` back to the repo root, or repoint the workspaces to `FRONTEND/packages/*` (and update
`docker-compose.yml`) and reinstall. This is a structure decision, not code.
