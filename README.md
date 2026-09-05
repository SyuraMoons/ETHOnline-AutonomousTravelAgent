# AutoVoyage

A risk-aware autonomous AI travel agent, built for an ETHGlobal hackathon.
The agent plans a trip, discovers and pays a live x402-gated flight-data
service (settled via the Blocky402 facilitator on Hedera testnet, with a
public audit trail on HCS), and gates the final booking/checkout action
behind a live World ID Selfie Check bound to the exact itinerary hash.

## Topology

```
┌─────────────────────┐          x402 (HTTP 402 + payment)          ┌──────────────────────┐
│      apps/web        │ ───────────────────────────────────────▶  │    apps/supplier      │
│  Next.js 15 (App Rtr) │        GET /v1/flights/search              │  Express + TS         │
│  planner + mandate    │ ◀───────────────────────────────────────  │  x402-gated seller     │
│  engine + consent UI  │          flight results (paid)             │  service               │
└─────────┬────────────┘                                            └───────────┬───────────┘
          │                                                                      │
          │ shared types                                                        │ shared types
          ▼                                                                      ▼
                        packages/contracts (zod schemas + z.infer types)
```

- `apps/web` — the agent's brain: mandate engine, planner, World ID consent
  flow, and the operator UI (mandate rail / plan / payment log).
- `apps/supplier` — the seller: a standalone x402-gated flight search + booking
  service, reading from a pre-scraped local cache (never scraping live on an
  incoming request).
- `packages/contracts` — shared zod schemas and inferred TS types used by both
  apps so their request/response shapes never drift apart.

## Setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
cp apps/supplier/.env.example apps/supplier/.env
pnpm dev
```

This runs both apps in parallel via the workspace's `dev` script
(`pnpm -r --parallel dev`). See each app's `.env.example` for the environment
variables it needs.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the branch model, workflow, and
commit conventions this project follows.
