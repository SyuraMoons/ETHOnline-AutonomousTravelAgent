# x402 Payment Skeleton — Agent Guide

Guidance for coding agents working in this repo. It started as Hedera's `x402-pay-per-use`
Scaffold-HBAR template (a file marketplace); the file-marketplace-specific code (MinIO storage,
`FileRegistry` contract, upload/download UI) has been **removed**. What remains is x402 payment
plumbing on Hedera, now wired into a real travel-planning build (see below).

## Overview

Buyers pay native **HBAR** (tinybars) via a self-hosted **x402 Hedera facilitator** that
verifies and settles each payment on testnet. Two real paid routes exist today on
`packages/supplier`, and `packages/frontend`'s planner genuinely pays them.

**Who pays: the user, autonomously.** The user authorizes once — set a spending budget, then a
single HashPack **HIP-336 HBAR allowance** approval — and the agent then pays the supplier from
the *user's own account* with no further signing. That one wallet signature is the human
authorization: on-chain, non-custodial, and revocable at any time. The agent
signs each transfer with its server-held key, but the HBAR leaves the user's account and
HashScan shows the user as payer. This is non-custodial: the agent never holds user funds, and
the allowance is revocable at any time. See "Allowance mode vs treasury mode" below.

Set `FACILITATOR_ADVERTISED_FEE_PAYER` empty to fall back to **treasury mode**, where the agent
pays from its own balance (the original behaviour, still supported).

A third buyer path, HashPack/browser-wallet payment (`services/x402/client.ts`'s `payAndFetch`),
is wired but **unused by any UI flow** — it would require a wallet signature per payment, which
is exactly what the allowance design exists to avoid.

## Target Build — "Rayban" (working codename)

The paid route being built, per the hackathon PRD (kept locally as
`Rayban-Build-Spec.pdf`, gitignored — not in the tracked tree):

A travel-planning agent that buys flight data per query over x402/HBAR, requires an explicit
confirm bound to the exact itinerary hash before booking, and writes every payment, approval,
booking, and refusal to a public HCS audit topic.

**Naming flag**: "Rayban" collides with the Ray-Ban trademark. Fine as an internal codename;
resolve before any public repo/submission (candidates: Warrant, Hallpass, Nullifier).

### Built — Supplier (`Meridian Flight Data`, `packages/supplier`, port 4100)

A real, live x402 service. Verified end-to-end with settled Hedera testnet transactions.

- `GET /.well-known/x402` — agent card (`payTo`, pricing labels, `bookingPublicKey`). See
  `routes/wellKnown.ts`.
- `GET /v1/flights/search` — 402-gated, priced `clamp(resultCount × 0.05, 0.10, 2.50)` HBAR.
  Quote cache (`lib/quotes.ts`, keyed by `sha256(canonicalJson(query))`, 300s unpaid / 900s
  paid) guarantees the unpaid 402 price and the paid response agree. See `routes/flights.ts`.
- `POST /v1/booking` — flat 1.00 HBAR, returns an Ed25519-signed `CONFIRMED_SIMULATED`
  confirmation (`lib/signing.ts`) — no real reservation, never dress this up. Only offers
  present in `data/cache/flights.json` are bookable (`lib/inventory.ts`'s
  `findOfferById`); generated fallback rows 404 on booking. See `routes/booking.ts`.
- `GET /health` — reports `payTo`, `facilitatorReachable`, `inventoryRows`.
- Wiring: `services/x402/server.ts` (`registerRoute`/`withPayment` — the seller side of
  `x402HTTPResourceServer`).

### Built — Planner pays the supplier (`packages/frontend`)

`POST /api/plan` (`app/api/plan/route.ts`) actually buys flight data, not fake data:

1. Parses a free-text brief via one bounded LLM call (`services/ai/travelAgent.ts`,
   OpenRouter — the LLM never touches money or sees a price) or takes a structured trip from the
   search form directly.
2. Looks up (or lazily creates) a spending mandate and **quotes** the supplier
   (`services/autovoyage/supplierClient.ts` → `services/x402/agentBuyer.ts`'s `quote()`) to learn
   the real price — no payment yet.
3. Checks the mandate against the real quoted price (`services/autovoyage/mandate.ts`'s pure
   `checkMandate()` — total/per-tx/expiry ceilings, the one code path where a bug loses money
   live). Only if it clears does it call `pay()` and settle over x402 with the server-held
   `AGENT_ACCOUNT_ID`/`AGENT_PRIVATE_KEY`.
4. A round-trip brief pays **twice** (outbound + inbound legs — the supplier's search is one-way
   per call) and pairs the results client-side (`services/autovoyage/buildOptions.ts`).
5. Returns `{ kind: "plan", ..., payment: { amountHbar, transaction, hashscanUrl, ... } }` with a
   real settlement transaction id, or `{ kind: "refusal", reason, reply }` with **no flight
   data** if the mandate refuses or the supplier is unreachable — never a silent fallback.

`POST /api/mandate` creates/reads mandates; `GET /api/health` probes the supplier's own health.
`services/x402/client.ts` (`payAndFetch`, browser/HashPack) and `scripts/x402-buy.ts` (CLI, raw
key) are the two other buyer paths — neither is used by the planner's own payment flow, but
`x402-buy.ts` is still the fastest way to manually poke the supplier from a terminal.

### Not yet built

- **HCS registry discovery** — `app/api/registry/route.ts` is a 501 stub. The planner still
  reaches the supplier via `SUPPLIER_BASE_URL` env var, not an HCS registry topic read via
  Mirror Node.
- **Public deployment** — facilitator and supplier both run on `localhost` only.

### HCS audit topic — 4 plaintext event types (real, live)

`DataPayment`, `ActionRefused`, `HumanApproval`, `BookingExecuted` — one JSON message per
event, `{type, v, ...}`, under 1KB, readable on HashScan without a decoder. Separate topic from
the registry. Schema: `packages/contracts/src/audit.ts`. Writer: `services/hedera/hcsAudit.ts`
(`submitAuditEvent`, a real `TopicMessageSubmitTransaction` against `HCS_AUDIT_TOPIC_ID`, best-effort
— a submit failure logs and never breaks the payment/booking/consent decision that triggered it).
Reader: `GET /api/audit/[planId]` — reads Mirror Node's `GET /api/v1/topics/{id}/messages` live on
every request via `services/hedera/mirrorNode.ts`, no local cache. Emitted from `/api/plan`
(`DataPayment` per settled leg, `ActionRefused` on every refusal branch), `/api/consent/verify`
(`HumanApproval`), and `/api/execute` (`BookingExecuted` on a full booking, `ActionRefused` on any
refusal or failed leg). One-time setup: `npm run audit:create-topic`
(`scripts/hcs-create-audit-topic.ts`) creates the topic and prints the id for `HCS_AUDIT_TOPIC_ID`.

### Itinerary hash — the unforgeability anchor (implemented)

`packages/contracts/src/helpers.ts` implements both `canonicalJson()` (key-sorted, no
whitespace) and `itineraryHash(plan)` = `"0x" + sha256(canonicalJson({legs: [{offerId,
departUtc, priceMinor, currency}], paxCount, fareTotalMinor}))`. Used today by
`services/autovoyage/buildOptions.ts` to hash each `FlightOption`, and re-derived server-side at
`/api/execute` from the stored dossier — a mismatch is rejected as `ActionRefused ·
itinerary_mismatch`, never trusting a client-sent hash.

### Route status

| Route | Status | Purpose |
| --- | --- | --- |
| `GET /.well-known/x402` (supplier) | **done** | Agent card: pricing model, `payTo`, services |
| `GET /v1/flights/search` (supplier) | **done** | 402-gated, per-result metered, quote cache (300s unpaid / 900s paid) |
| `POST /v1/booking` (supplier) | **done** | Flat-fee 402, Ed25519-signed simulated confirmation |
| `GET /health` (supplier) | **done** | Facilitator reachability + inventory count |
| `POST /api/plan` (planner) | **done** | Brief → mandate check → pay → real flight data, or refusal |
| `POST /api/mandate` (planner) | **done** | Create/read a spending mandate (GET also returns its spend log) |
| `GET /api/agent` (planner) | **done** | Agent account id + default ceilings — the allowance spender |
| `GET /api/health` (planner) | **done** | Probes the supplier's own `/health` |
| `POST /api/consent/initiate` / `/verify` (planner) | **done** | Booking confirm session, signal = itinerary hash, writes `HumanApproval` |
| `POST /api/execute` (planner) | **done** | Re-derive hash, spend execution token, book, write `BookingExecuted`/`ActionRefused` |
| `GET /api/audit/:planId` (planner) | **done** | Live audit read via Mirror Node |
| `GET /api/registry` (planner) | **stub (501)** | HCS registry topic read via Mirror Node |

### Refusal reason codes (closed set)

`per_tx_ceiling_exceeded · total_ceiling_exceeded · mandate_expired · consent_missing ·
consent_expired · itinerary_mismatch · quote_expired` — schema: `packages/contracts/src/refusal.ts`.
`/api/plan` also surfaces two **operational** reasons, deliberately **not** in this closed set,
because they describe something going wrong rather than a mandate/consent decision:

- `supplier_unreachable` — the supplier is down or unreachable (transport failure).
- `payment_rejected` — the supplier answered but the transfer was refused at consensus, almost
  always because the user's on-chain allowance was revoked or exhausted. Kept distinct from
  `supplier_unreachable`: telling a user the supplier is down when they revoked their own
  allowance is a misdiagnosis of their own action.

Don't add new *protocol* reason codes without updating the schema and the audit spec together.

`/api/plan` refuses with `consent_missing` when the request carries no `mandateId` — no human
authorized the spend. Set `ALLOW_UNAUTHORIZED_MANDATE=true` to restore the old behaviour where
`getOrCreateDefaultMandate()` let the agent authorize itself; acceptable only against the
agent's own treasury balance, never against a user's account.

### Env vars this build uses

Beyond the tables under "Addresses & Config" below:

`HCS_AUDIT_TOPIC_ID` — real, used by `services/hedera/hcsAudit.ts` and `GET /api/audit/[planId]`
(create the topic with `npm run audit:create-topic`). `HCS_REGISTRY_TOPIC_ID` — declared, not yet
read by any code (`GET /api/registry` is still a stub). `EXECUTION_TOKEN_SECRET`,
`EXECUTION_TOKEN_TTL_SECONDS` — real, used by
`services/autovoyage/executionToken.ts`. `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`,
`OPENROUTER_MODEL` — real, used by `services/ai/travelAgent.ts`. `NEXT_PUBLIC_DEMO_MODE` —
declared, read by zero code. `NEXT_PUBLIC_TRANSPORT` — declared, read by zero code: `/api/plan`
is a plain single-shot JSON POST, not SSE, despite this var suggesting otherwise.

## Solidity Framework

**Hardhat-only** monorepo (no Foundry package):

- **`packages/hardhat`** — generic Hardhat/Hedera tooling (network config, deployer-account
  scripts, Sourcify verification). No contract exists yet.
- **`packages/frontend`** — Next.js app: wallet connect + x402 client/server plumbing + the
  planner (see Target Build above).
- **`packages/supplier`** — Express service, the x402-gated flight data supplier.
- **`facilitator/`** — self-hosted x402 Hedera facilitator (verify / settle).
- **`docker-compose.yml`** — facilitator only for local dev; the supplier runs via
  `npm run supplier:dev`, not a container.

Payments settle on Hedera **testnet** via native HBAR transfers. The facilitator runs locally.
Do **not** forbid Docker for this template.

## Architecture

### x402 flow — supplier as seller

```text
Buyer → GET /v1/flights/search or POST /v1/booking
          └─ 402 PAYMENT-REQUIRED (packages/supplier/src/services/x402/server.ts)
                → buyer signs HBAR transfer
                → retry with PAYMENT-SIGNATURE
                → supplier verify + settle via facilitator
                → PAYMENT-RESPONSE + real flight data / booking confirmation
```

Add a new priced route on the supplier with `registerRoute(pattern, price)` (`price` can be a
`DynamicPrice` for per-result metering, see `routes/flights.ts`) then wrap the handler in
`withPayment(...)` — both in `packages/supplier/src/services/x402/server.ts`.

### x402 flow — planner as buyer

```text
/api/plan → quote(url)                          (services/x402/agentBuyer.ts, unpaid GET)
          → checkMandate(mandate, quotedPrice)  (services/autovoyage/mandate.ts, pure, no I/O)
          → refuse, or: pay(url, quote)         (services/x402/agentBuyer.ts, signs + settles)
          → recordSpend(mandateId, amount)      (only after settlement succeeds)
```

The quote/pay split matters: checking the mandate happens against the *real* price, before any
HBAR moves — a single pay-then-check call would let an over-ceiling payment settle anyway.

To add another planner→(x402 service) purchase, follow `services/autovoyage/supplierClient.ts`
as the pattern: build the request URL, `quote()` it, check the mandate, `pay()` it.

### Critical invariants

- The Next.js app **never** holds `FACILITATOR_PRIVATE_KEY`.
- Prices and x402 amounts are **tinybars** (1 HBAR = 1e8); asset id is `HBAR_ASSET` = `"0.0.0"`.
- A `payTo` account id is a Hedera account id string (e.g. `0.0.1234`), not an EVM address.
- The planner's `AGENT_ACCOUNT_ID` (buyer), the supplier's `PAY_TO` (seller), and the
  facilitator's `FACILITATOR_ACCOUNT_ID` (fee-payer) must be **three distinct accounts** —
  buyer == payTo nets the transfer to zero (`amount_mismatch`); buyer == fee-payer is rejected
  (`fee_payer_transferring_hbar`).
- Native HBAR (`"0.0.0"`) isn't in `@x402/core`'s recognized-default-asset list, so any
  server-side/CLI buyer must call `.setSpendControls(false)` on the client — see
  `services/x402/agentBuyer.ts` and `scripts/x402-buy.ts`.
- `@x402/core`'s `HTTPResourceResponse` has `{ status, paymentStatus, body, header? }` —
  `paymentStatus` is `"settled" | "settle_failed" | "payment_required" | "none"`. It has **no**
  `kind` or `settleResponse` field; checking those silently reports failure on a successful
  payment (a real bug hit and fixed in this repo — see `agentBuyer.ts`/`client.ts`).
- `extra.feePayer` means **"the account that owns the transaction id"**, not "the account that
  sponsors the fee". The scheme rejects any mismatch
  (`invalid_exact_hedera_payload_fee_payer_mismatch`), so the signer must build
  `TransactionId.generate(feePayer)`.
- **The facilitator's `@x402/hedera` is pinned to exactly `2.13.2` — do not widen it to a
  caret.** 2.25+ adds a mandatory `verifyPayerSignature` that fetches the debited account's key
  from Mirror Node. Under an allowance the debited account is the *user*, who never signs, so
  every allowance payment would fail closed with
  `invalid_exact_hedera_payload_signature_invalid`. Re-run
  `packages/frontend/scripts/allowance-probe*.ts` before touching that version.

### Allowance mode vs treasury mode (who pays)

The facilitator runs in exactly one of two mutually exclusive modes, chosen by
`FACILITATOR_ADVERTISED_FEE_PAYER` (`facilitator/src/server.ts`). Only one account can be
advertised at a time — the scheme picks at random when several are listed.

| | **Allowance mode** (default) | **Treasury mode** |
| --- | --- | --- |
| `FACILITATOR_ADVERTISED_FEE_PAYER` | the planner's `AGENT_ACCOUNT_ID` | unset |
| Debited (on-chain payer) | the **user**, via HIP-336 allowance | the agent |
| Signs the transfer | the agent | the agent |
| Owns the transaction id / pays node fee | the agent | the facilitator |
| Facilitator's role | verify + submit (its signature is superfluous) | verify + sponsor + submit |
| Client signer | `services/x402/allowanceSigner.ts` | `createClientHederaSigner` |

Established on Hedera testnet by `packages/frontend/scripts/allowance-probe.ts` and
`allowance-probe-d.ts`, kept as evidence:

- **The transaction-id account MUST be the spender** for an approved HBAR transfer. With the
  facilitator owning it, the transfer fails precheck with `SPENDER_DOES_NOT_HAVE_ALLOWANCE`
  (probe A). With the agent owning it, it settles (probe B). The bundled protobufs state this
  rule only for `NftTransfer`, never for the HBAR `AccountAmount` — so it had to be measured,
  not read.
- **A different account may still submit**, which is what preserves the facilitator's role
  (probe D1/D2 — it settles whether or not the facilitator co-signs).
- **The allowance is a real ceiling**: over-spending fails with `AMOUNT_EXCEEDS_ALLOWANCE`
  (probe C), independently of any app-level mandate check.

In allowance mode the three-distinct-accounts invariant still holds, just with different
roles: debited = user, signer/transaction-id = agent, credited = `PAY_TO`.

**Hedera HBAR allowances never expire.** A mandate's `expiresAt` is app-level only, so ending
a session must also revoke on-chain (`approveHbarAllowance(owner, spender, 0)`, see
`services/web3/hbarAllowance.ts`) or the agent keeps its spending power indefinitely.

### HashPack / wallet integration

- Reown AppKit uses **only** the `hedera` namespace (`HederaAdapter` in `appKitHedera.ts`) — no
  `eip155` wagmi signing path for x402 payments.
- x402 payments: `createHederaProviderSigner` → `hedera_signTransaction` (partial sign;
  facilitator co-signs as fee payer). This is the browser-wallet path
  (`services/x402/client.ts`'s `payAndFetch`) — not currently used by any UI flow; the planner
  pays with its own server-held key instead (see Architecture above).
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
`packages/frontend/contracts/deployedContracts.ts` — do not hand-edit (regenerated on deploy).
Currently empty (no contract deployed).

## Key Paths

### `packages/frontend`

| Path | Purpose |
| ---- | ------- |
| `app/api/plan/route.ts` | Planner's pay-or-refuse flow — brief → mandate → pay → results |
| `app/api/mandate/route.ts` | Create/read/revoke a spending mandate; `PATCH` records the allowance tx id |
| `app/api/hedera/allowance/route.ts` | Mirror Node proxy — reads a live HIP-336 allowance back, so a refresh never re-asks for a signature |
| `app/api/threads/route.ts`, `app/api/threads/[threadId]/route.ts` | Chat/plan session persistence — find-or-create a thread per wallet, whole-snapshot save |
| `app/api/consent/{initiate,verify}/route.ts` | Booking confirm session + verify, signal = itinerary hash, writes `HumanApproval` |
| `app/api/execute/route.ts` | Spends the execution token, books every leg, writes `BookingExecuted`/`ActionRefused` |
| `app/api/audit/[planId]/route.ts` | Live HCS audit read via Mirror Node — no local cache |
| `app/api/registry/route.ts` | Stub — not yet built (see "Not yet built" above) |
| `services/hedera/hcsAudit.ts` | Real `TopicMessageSubmitTransaction` writer + event builders for the audit topic |
| `services/hedera/mirrorNode.ts` | Shared Mirror Node base-URL + paginated topic-message reader |
| `services/db/supabase.ts` | Server-only Supabase client (service-role key) — the DB entry point for every store below |
| `services/x402/agentBuyer.ts` | Server-side x402 buyer — `quote()` + `pay()`, server-held key; `payFrom` selects allowance vs treasury |
| `services/x402/allowanceSigner.ts` | Signs payments that debit the **user's** account under a HIP-336 allowance |
| `services/web3/hbarAllowance.ts` | Browser grant/revoke of the HBAR allowance, plus `readHbarAllowance()` to check a live grant without signing |
| `services/autovoyage/authorizationContext.tsx` | Holds the granted spending authority: mandate + allowance state. Reconciles the DB mandate against the on-chain allowance on load (stages `resuming`/`orphaned`) so a refresh never re-asks for a signature |
| `components/autovoyage/chat/ChatBudgetCard.tsx` | The one-time authorize flow (set budget → approve allowance → revoke), plus the resume/orphan UI |
| `services/x402/server.ts` | `x402ResourceServer` + `ExactHederaScheme` — for gating your own route |
| `services/x402/client.ts` | Browser x402 client (`payAndFetch`), HashPack — unused by planner today |
| `services/x402/walletSigner.ts` | HashPack partial-sign signer |
| `services/autovoyage/mandate.ts` | Pure, synchronous `checkMandate()`; everything else (create/get/reserve/commit spend) is Postgres-backed |
| `services/autovoyage/supplierClient.ts` | Agent-card fetch + quote/pay wrapper for the supplier |
| `services/autovoyage/buildOptions.ts` | Real `SearchResult[]` → ranked `FlightOption[]` |
| `services/autovoyage/consentSessions.ts` | Postgres-backed booking-confirm session store |
| `services/autovoyage/dossierStore.ts` | Postgres-backed `TripDossier` store between an autonomous run finishing and "Book everything" |
| `services/autovoyage/chatThreads.ts` | Whole-snapshot chat/plan session read+write, one row per wallet |
| `services/autovoyage/executionToken.ts` | JWT minted at consent-verify, spent at execute |
| `services/ai/travelAgent.ts` | Bounded LLM brief-parsing call (OpenRouter) — never sees price |
| `services/web3/hederaContractWrite.ts` | Native contract writes (once you have a contract) |
| `utils/scaffold-hbar/hederaContractId.ts` | Hedera contract id resolution |
| `utils/x402.ts` | Tinybar helpers |
| `supabase/schema.sql` | Postgres schema for mandates/spend/reservations/consent/dossiers/chat threads — apply via the Supabase SQL editor |
| `scripts/x402-buy.ts` | CLI/agent buyer reference (`npm run x402:buy`) |
| `scripts/hcs-create-audit-topic.ts` | One-time setup: creates the HCS audit topic (`npm run audit:create-topic`) |
| `scripts/allowance-probe*.ts` | Testnet evidence for the HAPI allowance rules — keep, they justify the design |
| `scripts/allowance-*e2e.ts` | Full-stack allowance checks (search, round-trip plan, revoke) |
| `scripts/allowance-refusals.ts` | Offline checks that the mandate's brakes work — exercises `checkMandate()` directly, no DB needed |

### `packages/supplier`

| Path | Purpose |
| ---- | ------- |
| `src/services/x402/server.ts` | `registerRoute`/`withPayment` — the seller side |
| `src/routes/{flights,booking,wellKnown,health}.ts` | The four real routes |
| `src/lib/{quotes,inventory,signing,tinybar}.ts` | Quote cache, flight data, Ed25519 signing, tinybar math |
| `src/config.ts` | Env loading + pricing math, fail-fast on missing `PAY_TO`/`SUPPLIER_SIGNING_KEY` |

### Root

| Path | Purpose |
| ---- | ------- |
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
| `FACILITATOR_ACCOUNT_ID` / `FACILITATOR_PRIVATE_KEY` | Funded ECDSA account that signs + submits settlements (facilitator only) |
| `FACILITATOR_ADVERTISED_FEE_PAYER` | The account advertised as `extra.feePayer`, i.e. who owns the transaction id. Set to `AGENT_ACCOUNT_ID` for allowance mode; unset for treasury mode |
| `HEDERA_NODE_URL` | Optional custom consensus endpoint |

### `packages/supplier/.env` (see `.env.example`)

| Var | Purpose |
| --- | ------- |
| `FACILITATOR_URL` / `X402_NETWORK` | Same facilitator as the planner |
| `PORT` / `PUBLIC_BASE_URL` | Default `4100` / `http://localhost:4100` |
| `PAY_TO` | Hedera account id that receives buyer payments — **not** a key |
| `SEARCH_PRICE_PER_RESULT_HBAR` / `SEARCH_PRICE_MIN_HBAR` / `SEARCH_PRICE_MAX_HBAR` | Search pricing clamp |
| `BOOKING_FEE_HBAR` | Flat booking fee |
| `QUOTE_TTL_UNPAID_SECONDS` / `QUOTE_TTL_PAID_SECONDS` | Quote cache lifetime (300s / 900s default) |
| `SUPPLIER_SIGNING_KEY` | Ed25519 PKCS8 base64 — generate with `npm run supplier:gen-signing-key` |

### `packages/frontend/.env` (see `.env.example`)

| Var | Purpose |
| --- | ------- |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | HashPack / Reown |
| `FACILITATOR_URL` | Default `http://localhost:4020` |
| `X402_NETWORK` / `NEXT_PUBLIC_X402_NETWORK` | Must match (`hedera:testnet`) |
| `HEDERA_RPC_URL` | On-chain reads (once you have a contract) |
| `SUPPLIER_BASE_URL` | The supplier the planner buys from — default `http://localhost:4100` |
| `AGENT_ACCOUNT_ID` / `AGENT_PRIVATE_KEY` | Planner's own server-held Hedera key — must differ from both `FACILITATOR_ACCOUNT_ID` and the supplier's `PAY_TO` |
| `AGENT_MANDATE_TOTAL_HBAR` / `AGENT_MANDATE_PER_TX_HBAR` / `AGENT_MANDATE_TTL_MINUTES` | Ceilings offered as defaults in the authorize UI, and used by the dev-only default mandate |
| `ALLOW_UNAUTHORIZED_MANDATE` | `true` lets `/api/plan` self-authorize when no `mandateId` is sent. Dev only — never with a user's allowance |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Postgres store for mandates, spend, consent sessions, dossiers, chat threads (see `supabase/schema.sql`). Server-side only |

### Tinybar / asset rules

```ts
export const HBAR_ASSET = "0.0.0";
export const TINYBAR_PER_HBAR = 100_000_000n;
```

Never use floats for HBAR amounts. Convert in the UI with helpers in `packages/frontend/utils/x402.ts`.

## Commands

```bash
# Local infra (facilitator) — Docker required
npm run infra:up
npm run infra:down
npm run infra:logs

# Supplier (the paid flight data service)
npm run supplier:dev
npm run supplier:gen-signing-key   # generates SUPPLIER_SIGNING_KEY

# Contracts (Hardhat) — no contract exists yet; add one first
npm run hardhat:account:generate
npm run hardhat:deploy --network hederaTestnet
npm run hardhat:verify:testnet
npm run hardhat:test

# App (the planner)
npm run next:dev
npm run next:build

# HCS audit topic — one-time setup, then paste the printed id into HCS_AUDIT_TOPIC_ID
npm run audit:create-topic

# x402 agent buyer (Node script) — manual test against the supplier or any 402 route
RESOURCE_URL="http://localhost:4100/v1/flights/search?origin=SIN&destination=NRT&departDate=2026-10-12&paxCount=1" \
BUYER_ACCOUNT_ID=0.0.x BUYER_PRIVATE_KEY=0x... npm run x402:buy
# The planner's own /api/plan pays automatically with AGENT_ACCOUNT_ID — this script is for
# manual/CLI testing, not the app's actual payment path.

# Test the mandate/refusal paths directly
curl -s -X POST localhost:3000/api/mandate -H 'content-type: application/json' \
  -d '{"perTxCeilingHbar":0.01,"totalCeilingHbar":5,"ttlMinutes":60}'

# Allowance mode (agent spends the USER's HBAR) — all verified on testnet.
# Each *-e2e script creates its own throwaway user account and funds it from the facilitator.
npm run allowance:refusals     # offline: ceilings, reservation, expiry
npm run allowance:probe        # HAPI rule: spender MUST own the transaction id
npm run allowance:probe-d      # a third party may still submit
npm run allowance:e2e          # one paid search through the real x402 stack
npm run allowance:plan-e2e     # round trip via POST /api/plan (two paid legs)
npm run allowance:revoke-e2e   # revoking stops the agent on-chain

# Quality
npm run lint
npm run format
```

### Suggested bring-up order

1. `npm install`
2. Root `.env` — facilitator ECDSA credentials (funded)
3. `packages/supplier/.env` — `PAY_TO`, `SUPPLIER_SIGNING_KEY` (generate with
   `npm run supplier:gen-signing-key`)
4. `packages/frontend/.env` — WalletConnect project id, x402 vars, `AGENT_ACCOUNT_ID`/
   `AGENT_PRIVATE_KEY` (a **third** funded account, distinct from the two above)
5. `npm run infra:up` — facilitator; confirm `curl localhost:4020/health`
6. `npm run supplier:dev` — confirm `curl localhost:4100/health` shows `facilitatorReachable: true`
7. `npm run next:dev` — open `/plan`, search a route; confirm the results banner's HashScan link
   shows a real settled transaction
8. Optional: `npm run x402:buy` — CLI buyer against the supplier directly, for manual testing

## Skill Reference

Use skill: **`x402-payments`** for HTTP 402 / facilitator patterns, tinybar rules,
`x402ResourceServer` / `ExactHederaScheme` wiring, client retry loops, and operational checklists.
