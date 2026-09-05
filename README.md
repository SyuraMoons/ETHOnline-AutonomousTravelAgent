# x402 Payment Skeleton (Hedera)

A stripped-down base for building x402-gated services on Hedera: self-hosted **x402 facilitator**, **HashPack** wallet connect, and a generic browser/CLI x402 payment client. No example paid resource is wired up yet — this is scaffolding to build on top of.

Originally scaffolded from Hedera's `x402-pay-per-use` file-marketplace template (see [Scaffold HBAR](https://docs.hedera.com/solutions/tools/scaffold-hbar/index)); the file-marketplace-specific pieces (MinIO storage, `FileRegistry` contract, upload/download UI) have been removed, keeping only the reusable x402 payment plumbing.

## Disclaimer

This template—including **contracts, frontend, facilitator, and tooling**—is **experimental** and **not audited**. Use testnets and small amounts only.

Payments happen in **HBAR** via **HashPack**; a self-hosted **x402 Hedera facilitator** verifies and settles each payment on testnet. Wiring a specific paid resource (an API route that returns `402 Payment Required` and calls the facilitator) is left to the next build step.

## Prerequisites

- [Node.js](https://nodejs.org/) — see [Node.js version](#nodejs-version) below (default: **20 LTS** ≥ 20.18.3)
- npm (default; required if you clone this repo) or npm run if you scaffolded with the CLI. For npm, install via Corepack: `corepack enable && corepack prepare npm@stable --activate`
- [Git](https://git-scm.com/)
- [Docker](https://docs.docker.com/get-docker/) + Docker Compose (self-hosted facilitator)
- A funded **ECDSA** Hedera testnet account for the facilitator's fee-payer duties (and for a deployer account, once you add a contract)

## Node.js version

**Use Node 20 LTS (≥ 20.18.3) by default** for everything in this repo: `npm install`, Hardhat (compile, test, deploy, verify), Docker infra, and the Next.js app.

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Copy environment files:

```bash
cp .env.example .env
cp packages/nextjs/.env.example packages/nextjs/.env
```

3. Configure the facilitator fee-payer in root `.env` (see [Why the facilitator needs a private key](#why-the-facilitator-needs-a-private-key)):
   `FACILITATOR_ACCOUNT_ID` and `FACILITATOR_PRIVATE_KEY`. Fund that account with testnet HBAR from the [Hedera Portal faucet](https://portal.hedera.com/faucet).

4. Set `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` in `packages/nextjs/.env` (WalletConnect / HashPack).

5. Start local infra and the app:

```bash
npm run infra:up        # facilitator :4020
npm run next:dev        # http://localhost:3000
```

6. Connect **HashPack** in the header. From here, build your own x402-gated route (see "How it works" below) and use `services/x402/client.ts` (browser) or `scripts/x402-buy.ts` (CLI) to pay for it.

## How it works

The pieces below are generic and ready to point at whatever resource you build:

1. **Wallet connect** — one HashPack WalletConnect session (via Reown AppKit, **`hedera` namespace only**) for native Hedera signing. See `services/web3/{appKitHedera,hederaWalletConnect}.ts`.
2. **Resource server wiring** — `services/x402/server.ts` builds `PaymentRequirements`, issues the `402` challenge, and calls the facilitator's `/verify` + `/settle` endpoints. Wire this into any API route that should be paid-per-use.
3. **Browser payment client** — `services/x402/client.ts` (`payAndFetch`) implements the x402 retry loop: request the resource, read the `402` challenge, build and sign a native Hedera `TransferTransaction` via HashPack (**partial sign**, authorizing the HBAR debit), retry with `PAYMENT-SIGNATURE`, and return the settled response.
4. **CLI payment client** — `scripts/x402-buy.ts` mirrors the same flow using a raw Hedera private key, for machine-to-machine / agent use (`npm run x402:buy`).
5. **Settlement** — the facilitator **co-signs as fee payer**, submits the transaction to Hedera, and returns a `PAYMENT-RESPONSE` receipt.

## Why the facilitator needs a private key

Hedera x402 payments are **native transfers**, not EVM contract calls. HashPack can sign the buyer's side of that transfer, but it cannot pay Hedera network fees or broadcast the transaction on its own in this flow.

The self-hosted facilitator holds an **ECDSA fee-payer account** (`FACILITATOR_ACCOUNT_ID` + `FACILITATOR_PRIVATE_KEY`) so it can:

1. **Advertise** which account sponsors fees (`GET /supported` → `extra.feePayer`).
2. **Verify** the buyer's partially signed transfer matches the `402` challenge.
3. **Settle** by adding the fee-payer signature, paying the network fee from its HBAR balance, and submitting the transaction to consensus.

The buyer only authorizes moving their HBAR to the seller's `payTo` account. The facilitator never custodies buyer funds — it can only co-sign a transfer the buyer already approved.

The Next.js app does **not** need this private key. It only calls `FACILITATOR_URL`. Keep `FACILITATOR_PRIVATE_KEY` in server-side env (root `.env` for Docker, or `facilitator/.env` when running the service standalone), never in the browser.

## Environment variables

| Location | Key variables |
| --- | --- |
| Root `.env` | `FACILITATOR_ACCOUNT_ID`, `FACILITATOR_PRIVATE_KEY` (fee payer — see above), `X402_NETWORK`, `FACILITATOR_PORT` |
| `packages/nextjs/.env` | `FACILITATOR_URL`, `X402_NETWORK`, `NEXT_PUBLIC_X402_NETWORK`, `HEDERA_RPC_URL` |
| `facilitator/.env` | Same fee-payer credentials when running the facilitator outside Docker |

Full tables: [`RUNBOOK.md` — Environment variables](RUNBOOK.md#environment-variables).

## Adding a contract (optional)

`packages/hardhat` ships with generic Hedera/Hardhat tooling — network config, deployer-account scripts, and Sourcify verification — but no contract. To add one:

```bash
# write contracts/YourContract.sol and deploy/00_deploy_your_contract.ts, then:
npm run hardhat:account:generate   # or: npm run hardhat:account:import
npm run hardhat:deploy --network hederaTestnet
npm run hardhat:verify:testnet
```

Verified contracts appear on [Hashscan (testnet)](https://hashscan.io/testnet).

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run infra:up` / `npm run infra:down` | Start or stop the facilitator |
| `npm run infra:logs` | Follow Docker container logs |
| `npm run hardhat:test` | Run contract tests (none yet — add your own) |
| `npm run x402:buy` | CLI agent buyer script (see `RUNBOOK.md`) |
| `npm run facilitator:check-types` | Type-check the facilitator service |

## Caveats

- **HashPack only** — the demo uses Reown AppKit with HashPack on the native **`hedera`** WalletConnect namespace. MetaMask and the dev burner wallet are not supported.
- **Native Hedera signing** — payments go through HashPack's native Hedera APIs (`hedera_signTransaction`), not wagmi `eth_sendTransaction`.
- **ECDSA accounts** — buyers and the facilitator fee payer must use ECDSA keys (not ED25519).
- **HBAR balance** — buyers need testnet HBAR for each payment; the facilitator account needs HBAR to sponsor network fees.
- **Testnet settlement** — the facilitator runs locally, but payments settle on Hedera **testnet** (or mainnet if you change `X402_NETWORK`).
- **Node.js** — default **20 LTS** (≥ 20.18.3).
- **Docker** — required for `npm run infra:up`.
- **No on-chain privacy** — payment amounts and accounts are visible on HashScan.
- **Package churn** — pin `@x402/hedera` / `@x402/core` versions; APIs may change between releases.
- **External facilitator** — optional: point `FACILITATOR_URL` at a hosted service instead of the local Docker facilitator.

## Project layout

- **`packages/hardhat`** — generic Hedera/Hardhat tooling (network config, deployer-account scripts, verification); no contract yet
- **`packages/nextjs`** — Next.js app: wallet connect + x402 client/server plumbing (`services/x402/*`, `services/web3/*`)
- **`facilitator/`** — self-hosted x402 Hedera facilitator (verify / settle)
- **`docker-compose.yml`** — facilitator for local development

## Links

- [x402](https://x402.org/)
- [Hedera Documentation](https://docs.hedera.com/)
- [Hashscan](https://hashscan.io/) — block explorer
- [Hedera Portal faucet](https://portal.hedera.com/faucet)
- [create-scaffold-hbar](https://github.com/hedera-dev/create-scaffold-hbar) — CLI
