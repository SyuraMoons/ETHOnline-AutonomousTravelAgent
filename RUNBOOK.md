# x402 Payment Skeleton — Test Runbook

A step-by-step guide to verifying the pieces that remain after stripping the file-marketplace
scaffolding: wallet connect, the self-hosted facilitator, and the generic x402 payment client.
Run commands from the repository root unless stated otherwise.

> Status: this is a stripped skeleton. There is no example paid resource wired up yet — add one,
> then extend this runbook with the steps to exercise it end to end.

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

## Wiring a paid resource

There's no example route left in this skeleton — build your own using the generic pieces:

- **Resource server** — `packages/nextjs/services/x402/server.ts` builds `PaymentRequirements`,
  issues the `402` challenge, and calls the facilitator's `/verify` + `/settle`. Wire it into any
  API route.
- **Browser client** — `packages/nextjs/services/x402/client.ts` (`payAndFetch`) implements the
  402-challenge → sign (HashPack) → retry loop.
- **CLI client** — `packages/nextjs/scripts/x402-buy.ts` mirrors the same loop with a raw Hedera
  private key, for machine-to-machine use:

```bash
RESOURCE_URL="http://localhost:3000/api/<your-402-gated-route>" \
  BUYER_ACCOUNT_ID=0.0.xxxx BUYER_PRIVATE_KEY=0x... \
  npm run x402:buy
```

Once a route exists, a well-formed unpaid request should return:
- Status `402 Payment Required`.
- A `PAYMENT-REQUIRED` response header (base64 challenge for x402 clients).
- JSON body whose `accepts[0]` advertises `scheme: "exact"`, `network: "hedera:testnet"`, the
  price in tinybars, `payTo`, and `extra.feePayer` from the facilitator.

And a paid retry (with `PAYMENT-SIGNATURE`) should settle and return `200` with a
`PAYMENT-RESPONSE` header.

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

### `packages/nextjs/.env` (resource server + browser client)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` | WalletConnect project id (HashPack via Reown AppKit) |
| `HEDERA_RPC_URL` | RPC for on-chain reads |
| `FACILITATOR_URL` | x402 facilitator base URL (default `http://localhost:4020`) |
| `X402_NETWORK` | Server-side x402 network id |
| `NEXT_PUBLIC_X402_NETWORK` | Browser x402 client network (must match `X402_NETWORK`) |

### `facilitator/.env` (standalone facilitator, optional)

Used when running the facilitator outside Docker (`cd facilitator && npm run start`). Same
`FACILITATOR_ACCOUNT_ID`, `FACILITATOR_PRIVATE_KEY`, and `X402_NETWORK` as the root `.env`.

### Optional facilitator fallback

The default is the **self-hosted** facilitator from `docker-compose.yml`. To use an external
hosted facilitator instead, set `FACILITATOR_URL` in `packages/nextjs/.env` — this is not
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
