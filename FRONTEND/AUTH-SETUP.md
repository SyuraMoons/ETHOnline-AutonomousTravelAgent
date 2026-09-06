# AutoVoyage — Login Auth Setup

> Provision these credentials, then I wire the Login page (`/login`) buttons to the real thing.
> Nothing here is coded yet — this is the checklist to get the API keys first. **Never commit any
> secret**; they all go in `packages/frontend/.env.local` (gitignored), mirrored as empty keys in
> `.env.example`.

## The stack

| Method | Library | Type |
| --- | --- | --- |
| Email / Google / GitHub | **Auth.js (NextAuth v5)** — one route `app/api/auth/[...nextauth]/route.ts` | OAuth / passwordless |
| Connect wallet (HashPack) | **Reown AppKit** (already in the scaffold, `services/web3/*`) | Hedera wallet |

**Which one actually matters:** the **HashPack wallet is essential** — x402 payments are native Hedera
transfers your wallet must sign, so the agent can't pay without it. Google/GitHub are convenience
identity logins on top. If you only do one, do the wallet.

**Dev note:** this machine runs the app on **port 3010** (postgres holds 3000), so every redirect
URI below uses `localhost:3010`. Change the port/domain to match wherever you actually run it.

---

## 1. Google OAuth (the "Google" button)

1. Go to **console.cloud.google.com** → create (or pick) a project.
2. **APIs & Services → OAuth consent screen**: choose **External**, fill app name / support email,
   add your email as a **Test user** (so you can log in while it's unpublished). Save.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - **Authorized JavaScript origins:** `http://localhost:3010`
   - **Authorized redirect URIs:** `http://localhost:3010/api/auth/callback/google`
     (add your production URL's `…/api/auth/callback/google` too when you deploy).
4. Copy the **Client ID** and **Client secret**.

```dotenv
AUTH_GOOGLE_ID=<client id>
AUTH_GOOGLE_SECRET=<client secret>
```

## 2. GitHub OAuth (the "Github" button)

1. Go to **github.com → Settings → Developer settings → OAuth Apps → New OAuth App**
   (or an org's Developer settings).
2. Fill in:
   - **Homepage URL:** `http://localhost:3010`
   - **Authorization callback URL:** `http://localhost:3010/api/auth/callback/github`
3. Create it, copy the **Client ID**, then **Generate a new client secret** and copy it.

```dotenv
AUTH_GITHUB_ID=<client id>
AUTH_GITHUB_SECRET=<client secret>
```

> GitHub OAuth apps allow only **one** callback URL each. For prod, either create a second OAuth
> app or use a GitHub App. For the hackathon, one dev app is enough.

## 3. Auth.js session secret

Auth.js needs a secret to sign the session cookie. Generate one:

```bash
npx auth secret
```

(or `openssl rand -base64 33`). Put it in env:

```dotenv
AUTH_SECRET=<generated value>
# Auth.js usually infers the URL; set it explicitly for local if callbacks misbehave:
AUTH_URL=http://localhost:3010
```

## 4. Reown / WalletConnect project (the "Connect wallet" button — HashPack)

1. Go to **cloud.reown.com** (formerly WalletConnect Cloud) → sign in → **Create project**.
2. Type: **AppKit**. Name it AutoVoyage.
3. Add **Allowed domains**: `http://localhost:3010` (and your prod domain later).
4. Copy the **Project ID**.

```dotenv
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=<project id>
```

This is the one env the scaffold's Hedera wallet plumbing already expects. HashPack itself needs no
key — the user installs the HashPack extension/app and approves the connection; on **Hedera testnet**
with an **ECDSA** account (x402 requires ECDSA).

---

## Env summary (all in `packages/frontend/.env.local`)

```dotenv
# --- Auth.js (Google / GitHub / email) ---
AUTH_SECRET=
AUTH_URL=http://localhost:3010
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=

# --- Wallet (Reown AppKit / HashPack) ---
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=
```

Only `NEXT_PUBLIC_*` values reach the browser; everything else stays server-side (used only inside
the Auth.js route). `.env.local` is gitignored — keep it that way; if a secret leaks, rotate it in
the provider console.

## Redirect-URI cheat sheet

| Provider | URL to register |
| --- | --- |
| Google origin | `http://localhost:3010` |
| Google redirect | `http://localhost:3010/api/auth/callback/google` |
| GitHub homepage | `http://localhost:3010` |
| GitHub callback | `http://localhost:3010/api/auth/callback/github` |
| Reown allowed domain | `http://localhost:3010` |

---

## What I build once you have these

1. `npm i next-auth@beta` in `packages/frontend`; add `auth.ts` (Google + GitHub + email providers)
   and the `app/api/auth/[...nextauth]/route.ts` handler.
2. Wire the Login buttons: Google/Github → `signIn("google")` / `signIn("github")`; email → the
   passwordless flow; on success route into `/plan`.
3. Mount the Reown/HashPack wallet provider on the `(marketing)` login route and wire **Connect
   wallet** → open the AppKit modal (`services/web3/appKitHedera.ts`).
4. Add the keys to `.env.example` (empty) and update `INTEGRATION.md`.

Ping me when the credentials are in `.env.local` (or share which ones you have) and I'll implement.
