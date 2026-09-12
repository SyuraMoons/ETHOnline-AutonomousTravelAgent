

**AutoVoyage** is an autonomous travel-planning agent that pays for real flight data over
**x402 on Hedera**, per query, in native HBAR — no API keys, no subscriptions. A human
authorizes a spending budget once (a single HashPack **HIP-336 HBAR allowance** approval); after
that the agent quotes, checks its mandate against the real price, and pays the supplier directly
from the user's own account with no further signing. Every payment, refusal, human approval, and
booking is written to a public **Hedera Consensus Service (HCS)** audit trail.

This is a real, working build on Hedera testnet — not a mockup. Payments settle on-chain and are
verifiable on [HashScan](https://hashscan.io/testnet).

## Architecture

```
                 ┌─────────────────────────┐
  Human (once)   │  HashPack: approve a     │
  ───────────────▶  HIP-336 HBAR allowance  │
                 └─────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────┐
│  Planner (packages/frontend, Next.js)                │
│  POST /api/plan                                      │
│    1. parse brief (LLM, never sees price)            │
│    2. quote the supplier (real price, no payment yet)│
│    3. check spending mandate against that price       │
│    4. pay from the user's account (agent signs,       │
│       user's HBAR moves) — or refuse, no fallback data│
└───────────────────┬────────────────────────────────┘
                    │ x402 (402 → sign → retry → settle)
                    ▼
┌────────────────────────────────────────────────────┐
│  Facilitator — verify + settle                       │
│  self-hosted (facilitator/) or Blocky402 hosted       │
└───────────────────┬────────────────────────────────┘
                    ▼
┌────────────────────────────────────────────────────┐
│  Supplier (packages/supplier) — "Meridian Flight Data"│
│  GET /v1/flights/search   — 402-gated, per-result priced│
│  POST /v1/booking         — 402-gated, flat fee        │
│  GET /.well-known/x402    — agent card (payTo, pricing)│
└────────────────────────────────────────────────────┘

Every payment / refusal / approval / booking → HCS audit topic (public, HashScan-readable)
The supplier's agent card + identity → HCS registry topic (discoverable, self-attested)
```

## Payment flow

1. **Discover** — the planner resolves the supplier's endpoint via the **HCS agent registry**
   (falls back to a static URL if the registry has no entry yet), then reads its
   `GET /.well-known/x402` agent card.
2. **Quote** — the planner asks the supplier for the real price of a search/booking, unpaid.
3. **Check the mandate** — the *real* quoted price is checked against the user's spending
   ceilings (per-transaction, total, expiry) before any HBAR moves. A single pay-then-check
   design would let an over-ceiling payment settle anyway — this repo checks first.
4. **Pay or refuse** — if the mandate clears, the agent signs an HBAR transfer that debits the
   **user's** account (under their HIP-336 allowance) and credits the supplier. A facilitator
   verifies and settles it on-chain. If it doesn't clear, `/api/plan` returns a refusal with
   **no flight data** — never a silent fallback.
5. **Audit** — the payment (or refusal) is written as a plaintext JSON message to a public HCS
   topic, readable live via Mirror Node at `GET /api/audit/:planId`.
6. **Confirm before booking** — booking requires an explicit human confirm bound to the exact
   itinerary hash (`itineraryHash`, re-derived server-side, never trusted from the client).

See [`AGENTS.md`](AGENTS.md) for the full route table, refusal-reason schema, and every
architectural invariant (three distinct accounts, tinybar math, allowance vs. treasury mode).

### Two facilitators, two purposes

- **Self-hosted** (`facilitator/`, wraps the official `@x402/hedera` reference scheme) — powers
  the **allowance-mode** flow above (the non-custodial, "user authorizes once" design). Allowance
  mode requires the facilitator to advertise the *agent's own* account as fee-payer, which only a
  facilitator you configure yourself can do.
- **[Blocky402](https://blocky402.com)** (hosted, `https://api.testnet.blocky402.com`, no API
  key) — wire-compatible with the same protocol, used to prove a **treasury-mode** settlement
  through it directly (its advertised fee-payer is fixed to its own account, so it can't power
  allowance mode). See `AGENTS.md` → "Blocky402 as an alternate facilitator" for the exact
  commands and why.

  **Verified real settlement:** `tx 0.0.7162784@1789203651.016492909`, confirmed `SUCCESS` on
  [Mirror Node](https://testnet.mirrornode.hedera.com/api/v1/transactions/0.0.7162784-1789203651-016492909)
  — buyer `0.0.10286792` paid the supplier's `PAY_TO` in full; Blocky402's account only sponsored
  the Hedera network fee as fee-payer.

## Quickstart

```bash
npm install
cp .env.example .env                              # facilitator credentials
cp packages/supplier/.env.example packages/supplier/.env
cp packages/frontend/.env.example packages/frontend/.env

npm run infra:up          # self-hosted facilitator (Docker)
npm run supplier:dev       # Meridian Flight Data, :4100
npm run next:dev           # planner, :3000 → open /plan
```

You'll need **funded ECDSA Hedera testnet accounts** (get one at the
[Hedera Portal](https://portal.hedera.com/)) for the facilitator's fee-payer, the supplier's
`PAY_TO`, and the planner's `AGENT_ACCOUNT_ID` — **three distinct accounts**, see `AGENTS.md` for
why. Full step-by-step verification (curl commands, expected responses, common errors) is in
[`RUNBOOK.md`](RUNBOOK.md).

## What's real vs. simulated

| | Status |
| --- | --- |
| Flight search pricing, x402 402-gating, on-chain HBAR settlement | **Real** — settles on Hedera testnet, verifiable on HashScan |
| Flight inventory | Cached sample data, not a live GDS |
| Booking confirmation | **Real** payment, Ed25519-signed, but `CONFIRMED_SIMULATED` — never a real reservation |
| HCS audit trail | **Real** — a live `TopicMessageSubmitTransaction` per event, readable via Mirror Node |
| HCS agent registry + identity claim | **Real** — self-attested Ed25519 identity, independently verifiable |
| Public deployment | Not yet — facilitator and supplier both run on `localhost` |

## Repo layout

| Package | Role |
| --- | --- |
| [`packages/frontend`](packages/frontend) | The planner: Next.js app, wallet connect, x402 buyer, mandate/consent/audit/registry routes |
| [`packages/supplier`](packages/supplier) | Meridian Flight Data — the x402-gated flight search/booking service |
| [`facilitator`](facilitator) | Self-hosted x402 verify/settle service |
| [`packages/contracts`](packages/contracts) | Shared zod schemas (mandate, audit, registry, refusal, itinerary hash) |
| [`packages/hardhat`](packages/hardhat) | Generic Hardhat/Hedera tooling — no contract deployed yet |

## More docs

- [`AGENTS.md`](AGENTS.md) — the authoritative technical reference: every route, invariant,
  refusal reason, and architectural decision, kept current with the code
- [`RUNBOOK.md`](RUNBOOK.md) — step-by-step local setup and verification (curl commands, expected
  output)
- [`FRONTEND/`](FRONTEND) — frontend-specific docs (UI structure, auth setup, integration points)
