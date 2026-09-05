# x402 Payment Skeleton — Agent Guide

Guidance for coding agents working in this repo. It started as Hedera's `x402-pay-per-use`
Scaffold-HBAR template (a file marketplace); the file-marketplace-specific code (MinIO storage,
`FileRegistry` contract, upload/download UI) has been **removed**. What remains is generic x402
payment plumbing on Hedera, ready to gate whatever paid resource gets built next.

## Overview

Buyers pay native **HBAR** (tinybars) via HashPack; a self-hosted **x402 Hedera facilitator**
verifies and settles each payment on testnet. There is currently **no example paid route** —
the previous file-download endpoint was deleted along with the marketplace. Build a new
402-gated API route using the pieces below.

## Target Build — "Rayban" (working codename)

The paid route to build next, per the hackathon PRD (kept locally as
`Rayban-Build-Spec.pdf`, gitignored — not in the tracked tree):

A travel-planning agent that buys flight data per query over x402/HBAR, requires a live
World ID Selfie Check bound to the exact itinerary hash before booking, and writes every
payment, approval, booking, and refusal to a public HCS audit topic.

**Naming flag**: "Rayban" collides with the Ray-Ban trademark. Fine as an internal codename;
resolve before any public repo/submission (candidates: Warrant, Hallpass, Nullifier).

### Two services

- **Supplier** (`Meridian Flight Data`, separate origin, e.g. `packages/supplier` or similar) —
  x402-gated: `GET /.well-known/x402` (agent card), `GET /v1/flights/search` (priced per
  result row, `clamp(count × 0.05, 0.10, 2.50)` HBAR), `POST /v1/booking` (flat 1.00 HBAR,
  returns an Ed25519-signed `CONFIRMED_SIMULATED` confirmation — no real reservation, never
  dress this up).
- **Planner app** (`packages/nextjs`) — discovers the supplier via an HCS *registry* topic read
  at boot (Mirror Node REST, not SDK subscription), runs a spending mandate
  (total/per-tx/expiry ceilings, pure `checkMandate()` — the only code where a bug loses money
  live), parses a free-text brief via one bounded LLM call (LLM never touches money or sees a
  price), streams the pay/refuse loop over SSE, and gates booking behind a World ID Selfie
  Check whose *signal* is the itinerary hash.

### HCS audit topic — 4 plaintext event types

`DataPayment`, `ActionRefused`, `HumanApproval`, `BookingExecuted` — one JSON message per
event, `{type, v, ...}`, under 1KB, readable on HashScan without a decoder. Separate topic from
the registry.

### Itinerary hash — the unforgeability anchor

`itineraryHash = "0x" + sha256(canonicalJson({legs: [{offerId, departUtc, priceMinor,
currency}], paxCount, fareTotalMinor}))`. Define once in `packages/contracts` (new shared zod
package). Recomputed server-side at consent-verify and at execute — **never trust a
client-sent hash**. `/api/execute` re-derives it and rejects mismatches as
`ActionRefused · itinerary_mismatch`.

### Key new routes (none exist yet — build per this contract)

| Route | Purpose |
| --- | --- |
| `GET /.well-known/x402` (supplier) | Agent card: pricing model, `payTo`, services |
| `GET /v1/flights/search` (supplier) | 402-gated, per-result metered, quote-token cache (300s unpaid / 900s paid) |
| `POST /v1/booking` (supplier) | Flat-fee 402, Ed25519-signed simulated confirmation |
| `GET /api/registry` (planner) | HCS registry topic read via Mirror Node, env fallback |
| `POST /api/mandate` | Create spending mandate (ceilings + expiry) |
| `POST /api/plan` (SSE) | Brief → discover → quote → mandate check → pay/refuse → plan |
| `POST /api/consent/initiate` / `/verify` | World ID Selfie Check, signal = itinerary hash |
| `POST /api/execute` | Re-derive hash, spend execution token, book, write `BookingExecuted` |
| `GET /api/audit/:planId` / `GET /api/health` | Audit read + pre-demo health check |

### Refusal reason codes (closed set)

`per_tx_ceiling_exceeded · total_ceiling_exceeded · mandate_expired · consent_missing ·
consent_expired · itinerary_mismatch · quote_expired`

### Additional env vars this build will need (beyond the existing `.env.example` tables)

`HCS_REGISTRY_TOPIC_ID`, `HCS_AUDIT_TOPIC_ID`, `WORLD_APP_ID`, `WORLD_ACTION_ID`,
`WORLD_API_KEY`, `EXECUTION_TOKEN_SECRET`, `EXECUTION_TOKEN_TTL_SECONDS`, `ANTHROPIC_API_KEY`
(or equivalent LLM key), `NEXT_PUBLIC_DEMO_MODE` (`live|offline`), `NEXT_PUBLIC_TRANSPORT`
(`sse|poll`).

## Solidity Framework

**Hardhat-only** monorepo (no Foundry package):

- **`packages/hardhat`** — generic Hardhat/Hedera tooling (network config, deployer-account
  scripts, Sourcify verification). No contract exists yet.
- **`packages/nextjs`** — Next.js app: wallet connect + x402 client/server plumbing.
- **`facilitator/`** — self-hosted x402 Hedera facilitator (verify / settle).
- **`docker-compose.yml`** — facilitator only for local dev.

Payments settle on Hedera **testnet** via native HBAR transfers. The facilitator runs locally.
Do **not** forbid Docker for this template.

## Architecture

### x402 flow (generic — no route wired up yet)

```text
Buyer → GET /api/<your-route>
          └─ 402 PAYMENT-REQUIRED
                → client signs HBAR transfer (HashPack, or a raw key for CLI/agents)
                → retry with PAYMENT-SIGNATURE
                → resource server verify + settle via facilitator
                → PAYMENT-RESPONSE + your response body
```

To add a paid route: build `PaymentRequirements` and challenge/verify/settle via
`services/x402/server.ts` (`getResourceServer()`, `makeHttpContext()`), following the pattern the
former `/api/files/[id]/download` route used before it was deleted (see git history of the
original `x402-pay-per-use` template for reference, or the x402-payments skill below).

### Critical invariants

- The Next.js app **never** holds `FACILITATOR_PRIVATE_KEY`.
- Prices and x402 amounts are **tinybars** (1 HBAR = 1e8); asset id is `HBAR_ASSET` = `"0.0.0"`.
- A `payTo` account id is a Hedera account id string (e.g. `0.0.1234`), not an EVM address.

### HashPack / wallet integration

- Reown AppKit uses **only** the `hedera` namespace (`HederaAdapter` in `appKitHedera.ts`) — no
  `eip155` wagmi signing path for x402 payments.
- x402 payments: `createHederaProviderSigner` → `hedera_signTransaction` (partial sign;
  facilitator co-signs as fee payer).
- If you add a contract: `writeContractViaNativeProvider` → `hedera_signAndExecuteTransaction`,
  and deploy stores both `address` (EVM `0x…`) and `hederaContractId` (`0.0.x`) in
  `deployedContracts.ts`. Native contract executes must use the Hedera id —
  `ContractId.fromSolidityAddress` is wrong for JSON-RPC-deployed contracts.

### Frontend hooks (generic scaffold-hbar)

- `useScaffoldReadContract` / `useScaffoldWriteContract` — generic contract read/write hooks,
  available once you deploy a contract.
- `useScaffoldEventHistory` — avoid on Hedera testnet/mainnet (7-day `eth_getLogs` limit); prefer
  view-function reads or an indexer instead.

After `npm run hardhat:deploy`, ABIs and addresses land in
`packages/nextjs/contracts/deployedContracts.ts` — do not hand-edit (regenerated on deploy).
Currently empty (no contract deployed).

## Key Paths

| Path | Purpose |
| ---- | ------- |
| `packages/nextjs/services/x402/server.ts` | `x402ResourceServer` + `ExactHederaScheme` — wire into your own route |
| `packages/nextjs/services/x402/client.ts` | Browser x402 client (`payAndFetch`) |
| `packages/nextjs/services/x402/walletSigner.ts` | HashPack partial-sign signer |
| `packages/nextjs/services/web3/hederaContractWrite.ts` | Native contract writes (once you have a contract) |
| `packages/nextjs/utils/scaffold-hbar/hederaContractId.ts` | Hedera contract id resolution |
| `packages/nextjs/utils/x402.ts` | Tinybar helpers |
| `packages/nextjs/scripts/x402-buy.ts` | CLI/agent buyer reference (`npm run x402:buy`) |
| `facilitator/` | Self-hosted verify/settle service |
| `docker-compose.yml` | `facilitator` |

## Addresses & Config

### Docker Compose services

| Service | Role | Ports |
| ------- | ---- | ----- |
| `facilitator` | x402 verify/settle (`./facilitator`) | `4020` |

### Root `.env` (see `.env.example`)

| Var | Purpose |
| --- | ------- |
| `FACILITATOR_PORT` | Default `4020` |
| `X402_NETWORK` | `hedera:testnet` |
| `FACILITATOR_ACCOUNT_ID` / `FACILITATOR_PRIVATE_KEY` | Funded ECDSA fee-payer (facilitator only) |
| `HEDERA_NODE_URL` | Optional custom consensus endpoint |

### `packages/nextjs/.env` (see `.env.example`)

| Var | Purpose |
| --- | ------- |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | HashPack / Reown |
| `FACILITATOR_URL` | Default `http://localhost:4020` |
| `X402_NETWORK` / `NEXT_PUBLIC_X402_NETWORK` | Must match (`hedera:testnet`) |
| `HEDERA_RPC_URL` | On-chain reads (once you have a contract) |

### Tinybar / asset rules

```ts
export const HBAR_ASSET = "0.0.0";
export const TINYBAR_PER_HBAR = 100_000_000n;
```

Never use floats for HBAR amounts. Convert in the UI with helpers in `packages/nextjs/utils/x402.ts`.

## Commands

```bash
# Local infra (facilitator) — Docker required
npm run infra:up
npm run infra:down
npm run infra:logs

# Contracts (Hardhat) — no contract exists yet; add one first
npm run hardhat:account:generate
npm run hardhat:deploy --network hederaTestnet
npm run hardhat:verify:testnet
npm run hardhat:test

# App
npm run next:dev
npm run next:build

# x402 agent buyer (Node script) — point RESOURCE_URL at your own route
npm run x402:buy

# Quality
npm run lint
npm run format
```

### Suggested bring-up order

1. `npm install`
2. Root `.env` — facilitator ECDSA credentials (funded)
3. `packages/nextjs/.env` — WalletConnect project id + x402 vars
4. `npm run infra:up` — facilitator; confirm `/health`
5. `npm run next:dev` — build and exercise your own 402-gated route
6. Optional: `npm run x402:buy` — CLI buyer against your route

## Skill Reference

Use skill: **`x402-payments`** for HTTP 402 / facilitator patterns, tinybar rules,
`x402ResourceServer` / `ExactHederaScheme` wiring, client retry loops, and operational checklists.
