# AutoVoyage

**AutoVoyage** is an autonomous travel-planning agent that pays for real flight, stay, and
activity data over **x402 on Hedera**, per query, in native HBAR — no API keys, no subscriptions.
A human authorizes a spending budget once (a single HashPack **HIP-336 HBAR allowance** approval);
after that the agent quotes, checks its mandate against the real price, and pays the supplier
directly from the user's own account with no further signing. Every payment, refusal, human
approval, and booking is written to a public **Hedera Consensus Service (HCS)** audit trail.

This is a real, working build on Hedera testnet — not a mockup. Payments settle on-chain and are
verifiable on [HashScan](https://hashscan.io/testnet).

## Live demo

| | |
| --- | --- |
| **App (planner)** | https://rayban-cyan.vercel.app/ |
| **Demo video** | https://youtu.be/_Jos9u6NhWI |
| **Supplier** — Meridian Flight Data, x402-gated | https://supplier-rayban-production-ee5e.up.railway.app ([`/health`](https://supplier-rayban-production-ee5e.up.railway.app/health), [`/.well-known/x402`](https://supplier-rayban-production-ee5e.up.railway.app/.well-known/x402)) |
| **Self-hosted facilitator** | https://facilitator-rayban-production.up.railway.app ([`/supported`](https://facilitator-rayban-production.up.railway.app/supported)) |
| **Blocky402 facilitator** (hosted) | https://api.testnet.blocky402.com |

## Hackathon qualification

| Requirement | How this repo meets it |
| --- | --- |
| Live x402-gated service on Hedera testnet, settled through **Blocky402** | The live Railway supplier, pointed at Blocky402, settled a real paid flight search: [`0.0.7162784@1789314270.640883616`](https://hashscan.io/testnet/transaction/0.0.7162784-1789314270-640883616) — `SUCCESS`, buyer `0.0.10286792` → supplier `PAY_TO` `0.0.10440357` 0.3 HBAR in full, Blocky402's fee-payer `0.0.7162784` paid only the network fee. See [Blocky402 settlement](#blocky402-settlement). |
| Platform/agent that consumes the service, one real paid request end to end | The planner (`POST /api/plan`) quotes, checks the mandate, pays, and returns real data — e.g. [`0.0.10440385@1789312290.086572549`](https://hashscan.io/testnet/transaction/0.0.10440385-1789312290-086572549): the user `0.0.10286792` is debited under their allowance, the agent `0.0.10440385` signs, `PAY_TO` is credited. |
| Public GitHub repo, README covering setup, architecture, payment flow | [Setup](#setup) · [Architecture](#architecture) · [Payment flow](#payment-flow) |
| Demo video ≤ 5 minutes | https://youtu.be/_Jos9u6NhWI |

## Extra points

| Extra point | Status | Where |
| --- | --- | --- |
| Pay-per-call data metering (not a flat charge) | **Built** — every search is priced `clamp(resultCount × perResult, min, max)`, one band per domain: flights 0.05/0.10/2.50 HBAR, stays 0.04/0.10/2.00, activities 0.02/0.05/1.00. The unpaid 402 quote and the paid response share one quote cache, so the price can't drift between them. | [`packages/supplier/src/lib/pricing.ts`](packages/supplier/src/lib/pricing.ts), [`routes/paidSearch.ts`](packages/supplier/src/routes/paidSearch.ts) |
| On-chain agent identity (HCS-14) | **Built (HCS-14-style)** — `AgentIdentityClaimed` on HCS binds the agent id to its Ed25519 key, signed over canonical JSON. Any reader re-verifies the signature instead of trusting the writer. Proves key possession, not real-world identity. | [`packages/contracts/src/registry.ts`](packages/contracts/src/registry.ts), [`services/hedera/registry.ts`](packages/frontend/services/hedera/registry.ts) |
| Agent discovery directory | **Built** — an HCS registry topic carries `AgentRegistered` (the supplier's full agent card: `payTo`, services, pricing). The planner discovers the supplier from it, falling back to a static URL. Read it at `GET /api/registry`. | [`app/api/registry/route.ts`](packages/frontend/app/api/registry/route.ts), [`services/autovoyage/supplierClient.ts`](packages/frontend/services/autovoyage/supplierClient.ts) |
| Verifiable payment audit trail on HCS | **Built** — `DataPayment`, `ActionRefused`, `HumanApproval`, `BookingExecuted`, one plaintext JSON message each, readable on HashScan without a decoder and live via Mirror Node at `GET /api/audit/:planId`. | [`packages/contracts/src/audit.ts`](packages/contracts/src/audit.ts), [`services/hedera/hcsAudit.ts`](packages/frontend/services/hedera/hcsAudit.ts) |
| Multi-agent negotiation via A2A / ACP | Not built | — |
| HTS tokens / custom fee schedules | Not built — settlement is native HBAR | — |
| Recurring payments via Scheduled Transactions | Not built | — |

## Architecture

```
                 ┌──────────────────────────┐
  Human (once)   │  HashPack: approve a      │
  ───────────────▶  HIP-336 HBAR allowance   │
                 └──────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────┐
│  Planner (packages/frontend, Next.js — Vercel)        │
│  POST /api/plan                                       │
│    1. parse brief (LLM, never sees a price)           │
│    2. quote the supplier (real price, no payment yet) │
│    3. check spending mandate against that price       │
│    4. pay from the user's account (agent signs,       │
│       user's HBAR moves) — or refuse, no fallback data│
└───────────────────┬──────────────────────────────────┘
                    │ x402 (402 → sign → retry → settle)
                    ▼
┌──────────────────────────────────────────────────────┐
│  Facilitator — verify + settle                        │
│  self-hosted (facilitator/, Railway) or Blocky402     │
└───────────────────┬──────────────────────────────────┘
                    ▼
┌──────────────────────────────────────────────────────┐
│  Supplier (packages/supplier, Railway)                │
│  "Meridian Flight Data"                               │
│  GET  /v1/flights/search     — 402-gated, metered     │
│  GET  /v1/stays/search       — 402-gated, metered     │
│  GET  /v1/activities/search  — 402-gated, metered     │
│  POST /v1/booking            — no HBAR, simulated card│
│  GET  /.well-known/x402      — agent card             │
└──────────────────────────────────────────────────────┘

Every payment / refusal / approval / booking → HCS audit topic (public, HashScan-readable)
The supplier's agent card + identity claim  → HCS registry topic (discoverable, self-attested)
```

**HBAR buys data; a card buys the ticket.** Searches are metered and settle over x402. Booking
takes no payment header and moves no HBAR — it settles against a simulated card token and returns
one Ed25519-signed `CONFIRMED_SIMULATED` confirmation for the whole itinerary.

## Payment flow

1. **Discover** — the planner resolves the supplier's endpoint via the **HCS agent registry**
   (falling back to a static URL if the registry has no entry yet), then reads its
   `GET /.well-known/x402` agent card.
2. **Quote** — the planner requests the search unpaid and reads the real price from the 402
   response. No HBAR moves.
3. **Check the mandate** — the *real* quoted price is checked against the user's spending
   ceilings (per-transaction, total, expiry) before any HBAR moves. A pay-then-check design would
   let an over-ceiling payment settle anyway — this repo checks first.
4. **Pay or refuse** — if the mandate clears, the agent signs an HBAR transfer that debits the
   **user's** account (under their HIP-336 allowance) and credits the supplier. The facilitator
   verifies and settles it on-chain, and the supplier returns the data. If the mandate doesn't
   clear, `/api/plan` returns a refusal with **no data** — never a silent fallback.
5. **Audit** — the payment (or refusal) is written as a plaintext JSON message to a public HCS
   topic, readable live via Mirror Node at `GET /api/audit/:planId`.
6. **Confirm before booking** — booking requires an explicit human confirm bound to the exact
   itinerary hash (`itineraryHash`, re-derived server-side, never trusted from the client).

See [`AGENTS.md`](AGENTS.md) for the full route table, refusal-reason schema, and every
architectural invariant (three distinct accounts, tinybar math, allowance vs. treasury mode).

### Blocky402 settlement

The planner and the supplier speak the same x402 protocol to either facilitator. They're used for
different purposes:

- **[Blocky402](https://blocky402.com)** (hosted, `https://api.testnet.blocky402.com`, no API key)
  — the qualifying settlement above: the live Railway supplier with
  `FACILITATOR_URL=https://api.testnet.blocky402.com`, paid by the CLI buyer. Blocky402 acts as
  fee-payer and submits the transfer; the buyer pays `PAY_TO` in full.
- **Self-hosted** (`facilitator/`, wraps the official `@x402/hedera` scheme) — powers the app's
  **allowance mode** ("user authorizes once"). A HIP-336 allowance transfer only settles when the
  **spender (the agent) owns the transaction id**, so the facilitator must advertise the agent's
  account as fee-payer. Blocky402 always advertises its own fixed account (`0.0.7162784`), so it
  can't power this mode — only a facilitator you configure can. This rule was measured on testnet
  (`packages/frontend/scripts/allowance-probe*.ts`), not assumed.

Reproduce the Blocky402 settlement:

```bash
# 1. Supplier pointed at Blocky402 (locally, or set the same env var on the deployed service)
FACILITATOR_URL=https://api.testnet.blocky402.com npm run supplier:dev

# 2. The 402 quote should advertise Blocky402's fee-payer, 0.0.7162784
curl -si "http://localhost:4100/v1/flights/search?origin=SIN&destination=NRT&departDate=2026-10-12&paxCount=1" \
  | grep -i payment-required | cut -d' ' -f2 | base64 -d

# 3. Pay it from a funded testnet account that is NOT the supplier's PAY_TO
RESOURCE_URL="http://localhost:4100/v1/flights/search?origin=SIN&destination=NRT&departDate=2026-10-12&paxCount=1" \
BUYER_ACCOUNT_ID=0.0.x BUYER_PRIVATE_KEY=0x... npm run x402:buy
```

Then confirm on Mirror Node: `result: SUCCESS`, buyer debited, `PAY_TO` credited the same amount,
`0.0.7162784` paying only the network fee.

## Setup

A live deployment already exists — see [Live demo](#live-demo) — so you don't need to run this
locally just to try it. These steps are for local development.

```bash
npm install
cp .env.example .env                              # facilitator credentials
cp packages/supplier/.env.example packages/supplier/.env
cp packages/frontend/.env.example packages/frontend/.env

npm run supplier:gen-signing-key   # paste into SUPPLIER_SIGNING_KEY
npm run infra:up                   # self-hosted facilitator (Docker), :4020
npm run supplier:dev               # Meridian Flight Data, :4100
npm run next:dev                   # planner, :3000
```

You'll need **funded ECDSA Hedera testnet accounts** (get one at the
[Hedera Portal](https://portal.hedera.com/)) for the facilitator's fee-payer, the supplier's
`PAY_TO`, and the planner's `AGENT_ACCOUNT_ID` — **three distinct accounts**, see `AGENTS.md` for
why. For allowance mode, set `FACILITATOR_ADVERTISED_FEE_PAYER` to `AGENT_ACCOUNT_ID`.

Optional one-time HCS setup: `npm run audit:create-topic`, `npm run registry:create-topic`, then
`npm run registry:register-supplier`. Full step-by-step verification (curl commands, expected
responses, common errors) is in [`RUNBOOK.md`](RUNBOOK.md).

## What's real vs. simulated

| | Status |
| --- | --- |
| Search pricing, x402 402-gating, on-chain HBAR settlement | **Real** — settles on Hedera testnet, verifiable on HashScan |
| Settlement through Blocky402 | **Real** — see [Blocky402 settlement](#blocky402-settlement) |
| Flight / stay / activity inventory | Cached sample data, not a live GDS |
| Booking | **Simulated** — no HBAR moves, test card token only (`tok_test_…`; real card numbers are refused), Ed25519-signed `CONFIRMED_SIMULATED` confirmation, never a real reservation |
| HCS audit trail | **Real** — a live `TopicMessageSubmitTransaction` per event, readable via Mirror Node |
| HCS agent registry + identity claim | **Real** — self-attested Ed25519 identity, independently verifiable |
| Public deployment | **Real** — planner on Vercel, facilitator and supplier on Railway |

## Repo layout

| Package | Role |
| --- | --- |
| [`packages/frontend`](packages/frontend) | The planner: Next.js app, wallet connect, x402 buyer, mandate/consent/audit/registry routes |
| [`packages/supplier`](packages/supplier) | Meridian Flight Data — the x402-gated search and booking service |
| [`facilitator`](facilitator) | Self-hosted x402 verify/settle service |
| [`packages/contracts`](packages/contracts) | Shared zod schemas (mandate, audit, registry, refusal, itinerary hash) |
| [`packages/hardhat`](packages/hardhat) | Generic Hardhat/Hedera tooling — no contract deployed |

## More docs

- [`AGENTS.md`](AGENTS.md) — the authoritative technical reference: every route, invariant,
  refusal reason, and architectural decision
- [`RUNBOOK.md`](RUNBOOK.md) — step-by-step local setup and verification
- [`FRONTEND/`](FRONTEND) — frontend-specific docs (UI structure, auth setup, integration points)
