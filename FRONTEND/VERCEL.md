# Vercel Deployment

The Vercel project should point at this repository and deploy the `Frontend` branch. Set the
Vercel project Root Directory to `packages/frontend`; npm will still resolve the workspace lockfile
from the repository root.

## Project settings

- Framework preset: **Next.js**
- Root directory: `packages/frontend`
- Install command: `npm install`
- Build command: `npm run build`
- Node.js version: `20.x` or newer

The committed `packages/frontend/vercel.json` supplies the install and build commands.

## First deployment: demo mode

Use these values for the first preview deployment:

```text
NEXT_PUBLIC_DEMO_MODE=offline
NEXT_PUBLIC_TRANSPORT=poll
X402_NETWORK=hedera:testnet
NEXT_PUBLIC_X402_NETWORK=hedera:testnet
HEDERA_RPC_URL=https://testnet.hashio.io/api
NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL=https://testnet.hashio.io/api
```

Also configure `AUTH_SECRET` and `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID` if testing login or
wallet UI. The planner, consent, and execution endpoints are still scaffolds and return `501`;
demo mode is for validating the deployed frontend shell, not live booking.

## Live deployment prerequisites

Before switching `NEXT_PUBLIC_DEMO_MODE` to `live`, configure these as Vercel environment
variables, separately for Preview and Production:

- Auth.js: `AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`,
  `AUTH_GITHUB_SECRET`
- Hedera/x402: `HEDERA_RPC_URL`, `X402_NETWORK`, `FACILITATOR_URL`,
  `NEXT_PUBLIC_X402_NETWORK`
- Public client config: `NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID`,
  `NEXT_PUBLIC_HEDERA_MAINNET_RPC_URL`, `NEXT_PUBLIC_HEDERA_TESTNET_RPC_URL`
- Planner services: `HCS_REGISTRY_TOPIC_ID`, `HCS_AUDIT_TOPIC_ID`, `WORLD_APP_ID`,
  `WORLD_ACTION_ID`, `WORLD_API_KEY`, `EXECUTION_TOKEN_SECRET`,
  `EXECUTION_TOKEN_TTL_SECONDS`, `ANTHROPIC_API_KEY`

`FACILITATOR_URL` must be a public HTTPS endpoint. `http://localhost:4020` only works for local
development and cannot be used by Vercel serverless functions.

Register these OAuth callbacks with Google and GitHub using the deployed origin:

```text
https://<vercel-domain>/api/auth/callback/google
https://<vercel-domain>/api/auth/callback/github
```

## Smoke test

After each deployment, check:

```text
GET https://<vercel-domain>/api/health
```

The endpoint reports whether safe configuration categories are present without returning secret
values. Offline mode returns `200` when the mode is valid; live mode returns `200` only when all
required categories are present. A `503` response identifies an invalid mode or missing live
configuration in the `checks` object.