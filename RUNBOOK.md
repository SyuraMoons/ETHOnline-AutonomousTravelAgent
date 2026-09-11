# x402 Payment Skeleton — Test Runbook

A step-by-step guide to verifying the pieces that remain after stripping the file-marketplace
scaffolding: wallet connect, the self-hosted facilitator, and the generic x402 payment client.
Run commands from the repository root unless stated otherwise.

> Status: `packages/supplier` (`Meridian Flight Data`) is the first live paid resource —
> `GET /v1/flights/search` and `POST /v1/booking` genuinely 402-gate through the self-hosted
> facilitator. See [Testing the supplier](#testing-the-supplier) below.

## Prerequisites

| Tool | Version | Needed for |
| --- | --- | --- |
| Node.js | ≥ 20.18.3 (default); optional 22 for Next.js — see [README § Node.js version](README.md#nodejs-version) | Hardhat, Next.js, scripts |
| npm | 3.2.3 (via corepack) | monorepo scripts |
| Docker + Docker Compose | recent | the facilitator |
| A funded **ECDSA** Hedera testnet account | — | running the facilitator (and deploying a contract, once you add one) |

Get a testnet account and HBAR from the [Hedera Portal](https://portal.hedera.com/) faucet.
Create the account as **ECDSA** (x402 on Hedera requires ECDSA keys).

---

## Local infrastructure (facilitator)

The **self-hosted x402 Hedera facilitator** (verify/settle, no third-party service) runs locally
via Docker.

### 1. Configure

```bash
cp .env.example .env
```

Edit `.env` and set the facilitator fee-payer credentials.

**Why a private key here?** x402 payments settle as native Hedera `TransferTransaction`s.
The buyer's wallet only **partially signs** — authorizing debiting their HBAR to the seller's
`payTo` account. Something still has to (a) co-sign as **fee payer**, (b) pay the Hedera network
fee, and (c) **submit** the transaction. That is the facilitator's job; it needs
`FACILITATOR_ACCOUNT_ID` + `FACILITATOR_PRIVATE_KEY` server-side. The Next.js app never holds
this key (it only calls `FACILITATOR_URL`). Use a **dedicated ECDSA** testnet account, funded
with HBAR.

```dotenv
FACILITATOR_ACCOUNT_ID=0.0.xxxxxx
FACILITATOR_PRIVATE_KEY=0x...
```

### 2. Start the stack

```bash
npm run infra:up
```

Expected: the `facilitator` container starts.

### 3. Verify the facilitator

```bash
curl -s localhost:4020/health
curl -s localhost:4020/supported
```

Expected `/health`:

```json
{ "status": "ok", "network": "hedera:testnet", "feePayer": "0.0.xxxxxx" }
```

Expected `/supported` (note the advertised `feePayer` and signer match your account):

```json
{
  "kinds": [{ "x402Version": 2, "scheme": "exact", "network": "hedera:testnet", "extra": { "feePayer": "0.0.xxxxxx" } }],
  "extensions": [],
  "signers": { "hedera:*": ["0.0.xxxxxx"] }
}
```

An unknown route returns HTTP `404`.

### 4. Logs / teardown

```bash
npm run infra:logs    # follow container logs
npm run infra:down    # stop the stack
```

### 5. (Optional) Test the facilitator without Docker

```bash
cd facilitator
cp .env.example .env   # set FACILITATOR_ACCOUNT_ID / FACILITATOR_PRIVATE_KEY
npm install
npm run check-types    # type-checks against @x402/core + @x402/hedera
npm run start              # serves on :4020 — test with the curl commands above
```

---

## Testing the supplier

`packages/supplier` (`@sh/supplier`) is a standalone Express service — `Meridian Flight Data` —
separate from the Next.js app. It requires the facilitator (above) to be running first.

### 1. Configure

```bash
cp packages/supplier/.env.example packages/supplier/.env
```

Set `PAY_TO` to a Hedera account id that will receive buyer payments (any account, no key
needed — this is not the facilitator's fee-payer). Generate a booking-signature keypair:

```bash
npm run supplier:gen-signing-key
```

Paste the printed value into `SUPPLIER_SIGNING_KEY`.

### 2. Start the supplier

```bash
npm run supplier:dev
```

Expected: `[supplier] listening on :4100 (payTo=0.0.x, N cached flights)`. If `PAY_TO` or
`SUPPLIER_SIGNING_KEY` is unset, or the facilitator isn't reachable, startup fails fast with a
clear error instead of accepting requests it can't actually charge for.

```bash
curl -s localhost:4100/health
curl -s localhost:4100/.well-known/x402
```

### 3. Unpaid search returns a priced 402

```bash
curl -i "localhost:4100/v1/flights/search?origin=SIN&destination=NRT&departDate=2026-10-12&paxCount=1"
```

Expected `402`, with `accepts[0]` advertising `scheme: "exact"`, `network: "hedera:testnet"`,
`payTo` = your `PAY_TO`, `asset: "0.0.0"`, and `amount` in tinybars following
`clamp(resultCount × 0.05, 0.10, 2.50)` HBAR.

### 4. Pay for it

```bash
RESOURCE_URL="http://localhost:4100/v1/flights/search?origin=SIN&destination=NRT&departDate=2026-10-12&paxCount=1" \
  BUYER_ACCOUNT_ID=0.0.xxxx BUYER_PRIVATE_KEY=0x... \
  npm run x402:buy
```

Requires a **funded ECDSA testnet account distinct from `PAY_TO`** — if the buyer and `payTo` are
the same account, the transfer nets to zero at the facilitator's ledger check and settlement
fails with `invalid_exact_hedera_payload_amount_mismatch` (not a supplier bug — the two sides of
a self-payment cancel out). A successful run prints a settlement transaction id: verify it on
[HashScan testnet](https://hashscan.io/testnet) and confirm the buyer's balance dropped and
`PAY_TO`'s rose by exactly the tinybar amount from step 3.

For the booking route (flat fee, requires a real `offerId` from a search response):

```bash
METHOD=POST BODY='{"offerId":"flt_001","passengerName":"Ada Lovelace","passengerEmail":"ada@example.com"}' \
  RESOURCE_URL="http://localhost:4100/v1/booking" \
  BUYER_ACCOUNT_ID=0.0.xxxx BUYER_PRIVATE_KEY=0x... \
  npm run x402:buy
```

### Building your own paid route (Next.js side)

The generic pieces used above are also available server-side in `packages/frontend`:

- **Resource server** — `packages/frontend/services/x402/server.ts` builds `PaymentRequirements`,
  issues the `402` challenge, and calls the facilitator's `/verify` + `/settle`. Wire it into any
  API route.
- **Browser client** — `packages/frontend/services/x402/client.ts` (`payAndFetch`) implements the
  402-challenge → sign (HashPack) → retry loop.
- **CLI client** — `packages/frontend/scripts/x402-buy.ts` mirrors the same loop with a raw Hedera
  private key, for machine-to-machine use (same script used against the supplier above).

## Testing "the agent chat pays for real data"

With the facilitator and supplier both up (see above), the planner app itself now pays for
flight search results with its own server-held key — no browser wallet involved. This is the
`packages/frontend/app/api/plan` route calling `packages/frontend/services/autovoyage/supplierClient.ts`.

### 1. Configure a fourth, distinct Hedera account

`packages/frontend/.env` needs `AGENT_ACCOUNT_ID` / `AGENT_PRIVATE_KEY` — a funded ECDSA testnet
account **different from both**:

- the facilitator's fee-payer (root `.env` `FACILITATOR_ACCOUNT_ID`), else the payment is rejected
  as `invalid_exact_hedera_payload_fee_payer_transferring_hbar`;
- the supplier's `PAY_TO` (`packages/supplier/.env`), else the transfer nets to zero as
  `invalid_exact_hedera_payload_amount_mismatch`.

Also set `SUPPLIER_BASE_URL` (default `http://localhost:4100`) and, optionally, the default
spending mandate (`AGENT_MANDATE_TOTAL_HBAR`, `AGENT_MANDATE_PER_TX_HBAR`,
`AGENT_MANDATE_TTL_MINUTES` — see `.env.example`).

### 2. Run the app and search

```bash
npm run next:dev
```

Open `/plan` and either type a brief in the agent rail or submit the search form. Both paths hit
`POST /api/plan`, which quotes the supplier, checks the spending mandate against the **real**
quoted price, pays only if it clears, and returns real `SearchResult` legs.

Expect the results banner to read "Agent paid `<amount>` HBAR to Meridian Flight Data ... view
outbound tx(s) on HashScan" with real links. Open them — the transfer must debit
`AGENT_ACCOUNT_ID` and credit the supplier's `PAY_TO` for exactly the banner amount. A return
trip pays **twice** (outbound + inbound legs, paired client-side into round-trip options), since
the supplier's search endpoint is one-way per call.

### 3. Exercise the mandate and refusal paths

```bash
# per-tx ceiling
curl -s -X POST localhost:3000/api/mandate -d '{"perTxCeilingHbar":0.01,"totalCeilingHbar":5,"ttlMinutes":60}' -H 'content-type: application/json'
# use the returned mandateId in a /api/plan request -> "per_tx_ceiling_exceeded", no payment sent

# total ceiling: create a low totalCeilingHbar mandate, search twice with the same mandateId
# -> second search refuses "total_ceiling_exceeded", first search's spend still stands

# supplier down: stop packages/supplier, search again -> "supplier_unreachable", clean refusal
```

Every refusal returns `{ kind: "refusal", reply, reason, trip }` with **no flight data** — the
planner never falls back to fabricated results. Check the agent account's balance is unchanged
after each refusal (the mandate is checked against the quoted price *before* any payment is
attempted, so a refusal never spends).

## Environment variables

Copy each `.env.example` before running the stack.

### Root `.env` (docker-compose / `npm run infra:up`)

| Variable | Purpose |
| --- | --- |
| `FACILITATOR_PORT` | Host port for the facilitator (default `4020`) |
| `X402_NETWORK` | CAIP-2 network the facilitator settles on (`hedera:testnet`) |
| `FACILITATOR_ACCOUNT_ID` | ECDSA fee-payer account (`0.0.x`) advertised in `GET /supported` |
| `FACILITATOR_PRIVATE_KEY` | ECDSA key used at `POST /settle` to co-sign, pay network fees, and submit the buyer's partially signed transfer |
| `HEDERA_NODE_URL` | Optional custom consensus node RPC |

### `packages/frontend/.env` (resource server + browser client)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | WalletConnect project id (HashPack via Reown AppKit) |
| `HEDERA_RPC_URL` | RPC for on-chain reads |
| `FACILITATOR_URL` | x402 facilitator base URL (default `http://localhost:4020`) |
| `X402_NETWORK` | Server-side x402 network id |
| `NEXT_PUBLIC_X402_NETWORK` | Browser x402 client network (must match `X402_NETWORK`) |

### `packages/supplier/.env` (Meridian Flight Data)

| Variable | Purpose |
| --- | --- |
| `FACILITATOR_URL` | x402 facilitator base URL (default `http://localhost:4020`) |
| `X402_NETWORK` | Server-side x402 network id |
| `PORT` | Supplier listen port (default `4100`) |
| `PUBLIC_BASE_URL` | Public URL for this service, used in the `/.well-known/x402` agent card |
| `PAY_TO` | Hedera account id that receives buyer payments — no key required |
| `SEARCH_PRICE_PER_RESULT_HBAR` / `SEARCH_PRICE_MIN_HBAR` / `SEARCH_PRICE_MAX_HBAR` | `GET /v1/flights/search` pricing: `clamp(resultCount × PER_RESULT, MIN, MAX)` |
| `BOOKING_FEE_HBAR` | Flat fee for `POST /v1/booking` |
| `QUOTE_TTL_UNPAID_SECONDS` / `QUOTE_TTL_PAID_SECONDS` | How long a search quote (price ↔ results binding) stays valid before/after payment |
| `SUPPLIER_SIGNING_KEY` | Base64 PKCS8 Ed25519 key signing `CONFIRMED_SIMULATED` booking confirmations — generate with `npm run supplier:gen-signing-key` |

### `facilitator/.env` (standalone facilitator, optional)

Used when running the facilitator outside Docker (`cd facilitator && npm run start`). Same
`FACILITATOR_ACCOUNT_ID`, `FACILITATOR_PRIVATE_KEY`, and `X402_NETWORK` as the root `.env`.

### Optional facilitator fallback

The default is the **self-hosted** facilitator from `docker-compose.yml`. To use an external
hosted facilitator instead, set `FACILITATOR_URL` in `packages/frontend/.env` — this is not
required for local development.

---

## Testnet caveats

- **ECDSA keys only** — x402 on Hedera requires ECDSA accounts. Create testnet accounts via the
  [Hedera Portal](https://portal.hedera.com/) and fund them with HBAR.
- **Buyer needs HBAR** — every payment is a fresh native HBAR transfer. No token association is
  required for HBAR (`0.0.0`).
- **Facilitator fee payer** — the buyer's wallet cannot complete x402 settlement alone. The
  facilitator's ECDSA account co-signs each transfer, pays Hedera network fees from its HBAR
  balance, and broadcasts the transaction. Keep `FACILITATOR_PRIVATE_KEY` server-side only.
- **Testnet settlement** — the facilitator runs locally, but Hedera payments hit **testnet** (or
  mainnet if configured).
- **Native HashPack signing** — x402 payments use `hedera_signTransaction` (partial sign), on the
  `hedera` WalletConnect namespace — not wagmi / `eip155`.
- **Docker required** — `npm run infra:up` starts the facilitator container.
- **Node.js** — Node 20 LTS by default; optional Node 22 for `npm run next:dev` / `npm run next:build` only
  (see [README § Node.js version](README.md#nodejs-version)).
- **Pin `@x402/hedera`** — the package is young; expect API churn across releases.
- **No on-chain privacy** — transfer amounts, accounts, and settlement txs are public on Hedera.
