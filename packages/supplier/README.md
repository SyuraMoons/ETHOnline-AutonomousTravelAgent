# Meridian Flight Data (`packages/supplier`)

An x402-gated travel data service on Hedera testnet. Four paid endpoints sell flight, stay
and activity rows, and a flat-fee booking endpoint returns an Ed25519-signed simulated
confirmation. Buyers pay in native HBAR, per request, with no account, no API key and no
invoice.

This README is the bring-up guide. If you follow it start to finish you will have a real
payment settling on testnet, verifiable on HashScan, without asking anyone.

---

## What it is, and where it sits

Three separate parties are involved in every paid request, and keeping them separate is the
entire design.

```
  BUYER                          SUPPLIER (this package)        FACILITATOR
  agent or CLI                   packages/supplier              facilitator/, port 4020
  holds a funded key             holds NO payment key           holds the fee-payer key
       │                                  │                            │
       │  1. GET /v1/flights/search       │                            │
       │─────────────────────────────────▶│                            │
       │  2. 402, price in a header       │                            │
       │◀─────────────────────────────────│                            │
       │                                                               │
       │  3. sign an HBAR TransferTransaction (partial signature)      │
       │                                                               │
       │  4. retry, same URL + PAYMENT-SIGNATURE                       │
       │─────────────────────────────────▶│                            │
       │                                  │  5. verify, then settle    │
       │                                  │───────────────────────────▶│
       │                                  │                            │ co-signs as fee
       │                                  │                            │ payer, pays the
       │                                  │                            │ node fee, submits
       │                                  │  6. settlement receipt     │ to consensus
       │                                  │◀───────────────────────────│
       │  7. 200 + rows + PAYMENT-RESPONSE│                            │
       │◀─────────────────────────────────│                            │
```

**Why the facilitator is a separate process.** An x402 payment on Hedera settles as a native
`TransferTransaction`. The buyer's wallet only *partially* signs it: that signature authorises
moving HBAR out of the buyer's account and into `PAY_TO`. Somebody still has to co-sign as fee
payer, pay the network fee, and submit the transaction to a consensus node. That is a private
key with spending power, and putting it in the same process that serves the data would mean the
seller could move money on its own. So it lives in its own service (`facilitator/`, run from
`docker-compose.yml`), and the supplier only ever talks to it over HTTP at `FACILITATOR_URL`.

The practical consequence: **this package never holds a private key that can move funds.** The
only key it owns is `SUPPLIER_SIGNING_KEY`, an Ed25519 keypair used to sign booking
confirmations. It is not a Hedera account key and it cannot spend anything.

### The services

| Route | Method | Paid | What it charges for |
| --- | --- | --- | --- |
| `/v1/flights/search` | GET | yes | one row per flight offer on that route and date |
| `/v1/stays/search` | GET | yes | one row per property, already priced for the whole stay |
| `/v1/activities/search` | GET | yes | one row per bookable start time |
| `/v1/booking` | POST | yes, flat | one whole itinerary: legs, optional stay, optional activities |
| `/.well-known/x402` | GET | no | agent card: pricing, `payTo`, endpoints, booking public key |
| `/health` | GET | no | `payTo`, network, whether the facilitator answers |

`POST /v1/booking` always returns `status: "CONFIRMED_SIMULATED"`. It is never a real
reservation with a real airline or hotel, and nothing in this repo should describe it as one.
The signature is what makes it useful: it covers the whole resolved itinerary, not just a
booking id, so a confirmation attests to *what* was booked and at what price, and prices in it
come from the supplier's own inventory rather than from the request body.

---

## Three accounts, and they must be three different ones

This is the single most common way to lose an afternoon here.

| Role | Where it is configured | What it does |
| --- | --- | --- |
| **Buyer** | the buyer's own env (`BUYER_ACCOUNT_ID` / `BUYER_PRIVATE_KEY` for the CLI, `AGENT_ACCOUNT_ID` for the planner app) | spends the HBAR |
| **Payee** | `PAY_TO` in `packages/supplier/.env` | receives the HBAR. No key, just an account id |
| **Fee payer** | `FACILITATOR_ACCOUNT_ID` / `FACILITATOR_PRIVATE_KEY` in the root `.env` | co-signs, pays the node fee, submits |

Collapsing any two of these into one account fails, and fails late, at settlement:

- **buyer == fee payer** is rejected by the scheme as
  `invalid_exact_hedera_payload_fee_payer_transferring_hbar`. In this scheme `extra.feePayer`
  means "the account that owns the transaction id", and the protocol does not allow that account
  to also be a party transferring HBAR in the same transaction.
- **buyer == payee** nets the transfer to zero, and the ledger check rejects it as
  `invalid_exact_hedera_payload_amount_mismatch`. The two sides of a self-payment cancel out.

Get all three from the [Hedera Portal](https://portal.hedera.com/) faucet. Create them as
**ECDSA** accounts, which is what x402 on Hedera requires. The fee payer needs a real balance
because it pays a fee on every settlement; preflight refuses to continue below 5 HBAR. The payee
needs no balance at all. If you also intend to run the planner app, that is a fourth distinct
account.

---

## Bring-up

Run everything from the repository root. You need Node ≥ 20.18.3 and Docker.

### 0. Install

```bash
npm install
```

### 1. Generate the data caches

The supplier never fetches anything on the request path. Every row it sells comes from a file
written offline, which is what keeps a paid search fast and keeps a live demo independent of any
upstream. The generated caches are committed to the repo (`data/cache/*.json`), so a fresh clone
already has data. Regenerate when you want different data, a different seed, or a different date
window:

```bash
npm run data:generate            # flights, stays and activities
```

Or one domain at a time:

```bash
npm run flights:generate
npm run stays:generate
npm run activities:generate
```

Every generator validates each row against the shared `@sh/contracts` schema and rejects
duplicate ids before writing anything, so a malformed row fails here rather than reaching a
buyer who has already paid for it. Output is sorted, so regenerating unchanged data is a no-op
in git. Each cache gets a sibling `*.meta.json` recording the seed, row count and generation
time.

Generator knobs, all optional:

| Variable | Applies to | Effect |
| --- | --- | --- |
| `FLIGHTS_START_DATE` | `flights:generate` | First date in the 14-day window. **Defaults to today**, so pin it for reproducible output |
| `FLIGHTS_SEED` | `flights:generate` | Integer seed, default `20260910` |
| `FLIGHTS_SOURCE` | `flights:generate` | Row source id, default `generated` (see `scripts/sources/index.ts`) |
| `STAYS_SEED` | `stays:generate` | Integer seed, default `20260910` |
| `ACTIVITIES_SEED` | `activities:generate` | Integer seed, default `20260910` |

Check what you got, and what searching it will cost, without starting anything:

```bash
npm run data:inspect
npm run data:inspect -- --city DPS
npm run data:inspect -- --city NRT --date 2026-11-13 --pace calm
```

### 2. Write the supplier `.env`

```bash
npm run supplier:setup-env -- --payTo 0.0.10492723
```

Substitute your own payee account id. This creates `packages/supplier/.env` from the example if
it is missing, generates an Ed25519 signing keypair, and writes the private half straight into
the file. It prints only the public half, which is the part you actually need to read: it
verifies `BookingResponse.signature` and is served on the agent card anyway. Keeping the secret
off stdout keeps it out of scrollback, screen shares and pasted logs.

Re-running is safe. An existing signing key is left alone unless you pass `--force`, so you
cannot silently rotate a key the supplier is already signing with. `--payTo` is always applied.

If you prefer to print the keypair and paste it yourself, `npm run supplier:gen-signing-key`
does that instead.

### 3. Configure and start the facilitator

```bash
cp .env.example .env             # root .env, not the supplier one
```

Fill in `FACILITATOR_ACCOUNT_ID` and `FACILITATOR_PRIVATE_KEY` with your funded ECDSA account,
then:

```bash
npm run infra:up                 # needs Docker running
curl -s localhost:4020/health
```

Expect `{"status":"ok","network":"hedera:testnet","feePayer":"0.0.…","mode":"treasury"}`. If it
does not come up, `npm run infra:logs` will say why. Stop it later with `npm run infra:down`.

Start the facilitator **before** the supplier. The supplier fetches the facilitator's supported
payment kinds once, at startup, and refuses to boot if it cannot.

### 4. Start the supplier

```bash
npm run supplier:dev             # tsx watch, port 4100
```

Expect a line like:

```
[supplier] listening on :4100 (payTo=0.0.10492723; 1608 flights, 158 stays, 184 activities)
```

Startup deliberately fails fast on three things rather than surfacing them on a buyer's first
paid request: a missing `PAY_TO` or `SUPPLIER_SIGNING_KEY`, a facilitator that does not answer
or does not support the configured network, and a missing data cache for any of the three
domains.

For a compiled run instead of the watcher, `npm run supplier:build` then `npm run supplier:start`.

### 5. Preflight

```bash
npm run preflight
```

This checks every precondition for taking real money, in dependency order, and stops at the
first blocker because later checks would only fail for the same reason. It verifies the caches
exist, both `.env` files are filled in with no placeholder values, the facilitator account is
funded above 5 HBAR (read live from the mirror node), both services answer, the agent card lists
all four services, every paid route challenges with a non-zero price, and that the supplier and
the facilitator still agree on the fee payer.

Two of those checks exist specifically because the failure is otherwise invisible. The running
supplier reads its configuration once, at startup, so a `.env` edited afterwards leaves the file
correct and the live agent card stale, and every other check reports green while payments go to
the old address. Preflight compares the file against what the process is actually serving.

The last check wants `BUYER_ACCOUNT_ID` and `BUYER_PRIVATE_KEY` in your shell. They are the
*buyer's* credentials, not the facilitator's, and they are the only thing preflight cannot
discover for you.

### 6. Make a real paid request

```bash
RESOURCE_URL="http://localhost:4100/v1/flights/search?origin=CGK&destination=DPS&departDate=2026-11-12" \
  BUYER_ACCOUNT_ID=0.0.xxxxxx \
  BUYER_PRIVATE_KEY=0x... \
  npm run x402:buy
```

The CLI buyer lives in `packages/frontend/scripts/x402-buy.ts`. It performs the full loop: first
request, read the 402 challenge, sign the transfer with the raw Hedera key, retry with a
`PAYMENT-SIGNATURE` header, print the settlement transaction id and the response body.

A successful run prints `[x402-buy] Settled · tx 0.0.… · payer 0.0.…`. Open that on
[HashScan testnet](https://hashscan.io/testnet) and confirm the buyer's balance fell and
`PAY_TO`'s rose by exactly the tinybar amount quoted in the challenge. That is the moment the
bring-up is actually done.

To buy a booking, pass a real `offerId` from a search response:

```bash
METHOD=POST \
  BODY='{"legs":[{"offerId":"flt_cgkdps_20261112_03"}],"passengerName":"Ada Lovelace","passengerEmail":"ada@example.com"}' \
  RESOURCE_URL="http://localhost:4100/v1/booking" \
  BUYER_ACCOUNT_ID=0.0.xxxxxx BUYER_PRIVATE_KEY=0x... \
  npm run x402:buy
```

A booking request carries identifiers and times only. Prices are resolved from the supplier's own
inventory, never taken from the request, for the same reason a server re-derives an itinerary
hash instead of trusting a client-sent one. The request may also carry a `stay`
(`{hotelId, checkIn, checkOut}`) and `activities` (`[{activityId, startUtc}]`). Every component
is resolved and validated before anything is confirmed, so a request either produces one signed
confirmation covering the whole itinerary or changes nothing: a human approves one itinerary
hash, and booking the pieces separately would let one approval authorise several actions that
can fail independently.

---

## Debugging with curl: the challenge is in a header

**The 402 response body is `{}`.** The challenge rides in the `PAYMENT-REQUIRED` response
header, base64-encoded. If you read the body you will conclude every route is free and that the
supplier is broken. It is not; you are looking in the wrong place. Preflight had this exact bug
once.

```bash
curl -sD - -o /dev/null \
  "localhost:4100/v1/stays/search?city=DPS&checkIn=2026-11-12&checkOut=2026-11-15" \
  | grep -i '^payment-required:' | cut -d' ' -f2 | tr -d '\r' | base64 -d | python3 -m json.tool
```

```json
{
  "x402Version": 2,
  "error": "Payment required",
  "resource": { "url": "http://localhost:4100/v1/stays/search?city=DPS&checkIn=2026-11-12&checkOut=2026-11-15" },
  "accepts": [
    {
      "scheme": "exact",
      "network": "hedera:testnet",
      "amount": "96000000",
      "asset": "0.0.0",
      "payTo": "0.0.10492723",
      "maxTimeoutSeconds": 180,
      "extra": { "feePayer": "0.0.10374824" }
    }
  ]
}
```

`amount` is in **tinybars**: `96000000` is 0.96 HBAR, 24 properties at 0.04 each. `asset`
`"0.0.0"` is native HBAR. `payTo` must match your supplier `.env`, and `extra.feePayer` must
match the facilitator's `/health`. Two quick reads that answer most "why was this rejected"
questions:

```bash
curl -s localhost:4100/health          | python3 -m json.tool
curl -s localhost:4100/.well-known/x402 | python3 -m json.tool
```

The paid retry is the **same URL** with a payment header added. Nothing is echoed back to the
server: a quote is keyed by a hash of the normalised query, so the 402 and the paid retry resolve
to the same cached quote on their own, and a client cannot tamper with a quote token because
there is none to tamper with. That is also what guarantees the row count you were charged for is
the row count you receive.

---

## Pricing

Every search is metered on the number of rows it will return, with a floor and a cap:

```
price = clamp(resultCount × perResult, min, max)      # in HBAR
```

| Domain | Per result | Floor | Cap | Priced per |
| --- | --- | --- | --- | --- |
| Flights | 0.05 | 0.10 | 2.50 | one flight offer |
| Stays | 0.04 | 0.10 | 2.00 | one property, priced for the whole stay |
| Activities | 0.02 | 0.05 | 1.00 | one start time for one experience |
| Booking | flat 1.00 HBAR | | | one whole itinerary, regardless of contents |

**The rates differ because the rows are not worth the same.** A flight row is a whole itinerary
leg; a stay row is one property with a total for the requested nights; an activity row is a
single start time for a single experience, and one day in one city yields dozens of them.
Charging all three at the same rate would either make activity searches absurd or make flight
searches free.

**The cap matters as much as the rate.** An unfiltered "show me everything" search legitimately
costs the maximum, and the cap is what stops it costing more than the trip.

The booking fee is flat because it pays for the booking *action*, not the fare. Fares are quoted
in fiat minor units by the searches; the HBAR service fee is a separate thing and does not scale
with the itinerary.

The price is computed from the resolved quote before the 402 is built, so the count a buyer is
quoted on is always the count they receive. A malformed query is still given a price in the
challenge (`clamp(0)`, which is the floor), but no money moves from it: the handler rejects the
query with 400 before settlement is attempted, so a verified-but-invalid payment is never
submitted to the network.

Quotes live 300 seconds unpaid and 900 seconds once paid, so a buyer who has paid has room to
use what they bought without the rows shifting underneath them.

---

## Environment variables

### `packages/supplier/.env`

Copy from `.env.example`, or let `npm run supplier:setup-env` create it.

| Variable | What it is | Where to get it | Secret |
| --- | --- | --- | --- |
| `PAY_TO` | Hedera account id that receives buyer payments. An account id, never a key or an EVM address | [Hedera Portal](https://portal.hedera.com/). Must differ from the buyer and the fee payer | no |
| `SUPPLIER_SIGNING_KEY` | Ed25519 private key (base64 PKCS8 DER) that signs booking confirmations. Not a Hedera account key, cannot spend anything | `npm run supplier:setup-env`, or `npm run supplier:gen-signing-key` | **yes** |
| `FACILITATOR_URL` | Where verify and settle are called. Default `http://localhost:4020` | matches `FACILITATOR_PORT` in the root `.env` | no |
| `X402_NETWORK` | CAIP-2 network. Must match the facilitator and the buyer | `hedera:testnet` | no |
| `PORT` | Listen port. Default `4100` | you pick | no |
| `PUBLIC_BASE_URL` | Public origin advertised in the agent card's service endpoints. Defaults to `http://localhost:$PORT` | your deployed URL, if not local | no |
| `FACILITATOR_TIMEOUT_MS` | Verify/settle timeout. Default `120000`. See troubleshooting below before lowering it | leave it alone | no |
| `SEARCH_PRICE_PER_RESULT_HBAR` | Flight rate. Default `0.05` | you pick | no |
| `SEARCH_PRICE_MIN_HBAR` / `SEARCH_PRICE_MAX_HBAR` | Flight floor and cap. Defaults `0.10` / `2.50` | you pick | no |
| `STAY_PRICE_PER_RESULT_HBAR` | Stay rate. Default `0.04` | you pick | no |
| `STAY_PRICE_MIN_HBAR` / `STAY_PRICE_MAX_HBAR` | Stay floor and cap. Defaults `0.10` / `2.00` | you pick | no |
| `ACTIVITY_PRICE_PER_RESULT_HBAR` | Activity rate. Default `0.02` | you pick | no |
| `ACTIVITY_PRICE_MIN_HBAR` / `ACTIVITY_PRICE_MAX_HBAR` | Activity floor and cap. Defaults `0.05` / `1.00` | you pick | no |
| `BOOKING_FEE_HBAR` | Flat booking fee. Default `1.00` | you pick | no |
| `QUOTE_TTL_UNPAID_SECONDS` | Quote lifetime before payment. Default `300` | you pick | no |
| `QUOTE_TTL_PAID_SECONDS` | Quote lifetime after payment. Default `900` | you pick | no |

All HBAR amounts here are decimal strings converted to integer tinybars internally
(1 HBAR = 100,000,000 tinybars). Never introduce a float into that path.

### Root `.env`, which the supplier depends on

The supplier does not read these, but it cannot take a payment without them. See `.env.example`
and `docker-compose.yml`.

| Variable | What it is | Where to get it | Secret |
| --- | --- | --- | --- |
| `FACILITATOR_ACCOUNT_ID` | The fee payer's account id | Hedera Portal, funded, ECDSA, distinct from `PAY_TO` and the buyer | no |
| `FACILITATOR_PRIVATE_KEY` | The fee payer's key. Only the facilitator container ever sees this | same account | **yes** |
| `FACILITATOR_PORT` | Facilitator port. Default `4020` | you pick | no |
| `X402_NETWORK` | Must match the supplier's | `hedera:testnet` | no |
| `FACILITATOR_ADVERTISED_FEE_PAYER` | Which account is advertised as `extra.feePayer`. Leave unset for treasury mode, which is what the CLI buyer uses | see `AGENTS.md` on allowance vs treasury mode | no |
| `HEDERA_NODE_URL` | Optional custom consensus endpoint | leave blank | no |

### Read by tooling only

| Variable | Used by | Purpose |
| --- | --- | --- |
| `MIRROR_NODE_URL` | `npm run preflight` | Balance lookup. Default `https://testnet.mirrornode.hedera.com` |
| `BUYER_ACCOUNT_ID` / `BUYER_PRIVATE_KEY` | `npm run x402:buy`, preflight's last check | The spending account. **Secret** |
| `RESOURCE_URL`, `METHOD`, `BODY` | `npm run x402:buy` | What to buy |

---

## Troubleshooting

Each of these is a failure that actually happened while building this service.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `failed to parse entity id: 0.0.XXXXX`, or payments addressed to an account you already changed | The running supplier read its config **once, at startup**. Editing `.env` afterwards leaves the file correct and the live process stale, and the agent card keeps serving the old `payTo` | Restart it: `npm run supplier:dev`. `npm run preflight` compares the file against what the process is serving and will catch this |
| `no supported payment kinds loaded`, or the supplier exits at startup | The facilitator is not reachable at `FACILITATOR_URL`. The supplier validates every route against facilitator support before accepting traffic | `npm run infra:up`, then `curl -s localhost:4020/health`. `npm run infra:logs` if it did not start. Docker must be running |
| `invalid_exact_hedera_payload_fee_payer_transferring_hbar` | The buyer and the fee payer are the same account. The account that owns the transaction id cannot also be transferring HBAR in it | Use a different funded ECDSA account for `BUYER_ACCOUNT_ID` than the root `.env`'s `FACILITATOR_ACCOUNT_ID` |
| `invalid_exact_hedera_payload_amount_mismatch` | The buyer and `PAY_TO` are the same account, so the transfer nets to zero | Use three distinct accounts. See the table above |
| `the facilitator pays as 0.0.A but the supplier still advertises 0.0.B` (from preflight) | `FACILITATOR_ADVERTISED_FEE_PAYER` changed and only the facilitator was restarted. The supplier cached the fee payer at startup and repeats it in every 402 | Restart the supplier too |
| Settlement times out, or the response carries `x-settlement-unconfirmed: true` | Settle on testnet routinely exceeds the library's 30s default. `FACILITATOR_TIMEOUT_MS` is now `120000` for this reason | **Do not retry.** A settle that times out has *not* necessarily failed: the transfer can reach consensus while the reply is still in flight. Check HashScan or the facilitator's records first. Retrying a payment that already settled charges the buyer a second time. 1.10 HBAR was lost exactly this way |
| Results come back with `"fromInventory": false`, and a booking of them returns `Unknown offerId` | The requested date falls outside the generated cache window, so the search fell through to the synthetic fallback. Those rows exist to make a search look plausible for routes with no cached data, but their ids are not persisted anywhere a booking can look them up. **They cannot be booked** | Regenerate covering the dates you are demoing: `FLIGHTS_START_DATE=2026-11-08 npm run flights:generate`. Confirm with `npm run data:inspect` |
| A route returns 200 with data and you conclude it is not gated | You read the response body. The challenge is in the `PAYMENT-REQUIRED` header and the 402 body is `{}` | See "Debugging with curl" above |
| Search returns zero rows and costs the floor price | Wrong city code, or a date with no inventory. Cities are 3-letter IATA codes | `npm run data:inspect -- --city DPS` shows exactly what is there |
| `Flight cache unreadable at …` at startup | A cache file is missing | `npm run data:generate` |
| Preflight says an `.env` "has placeholder values" | A value still contains the `xxxxx` placeholder. The check is case-insensitive, because a hand-edited `0.0.XXXXX` once sailed through as a real account id | Fill in the real values |

---

## Development

```bash
npm run supplier:dev          # tsx watch on :4100
npm run supplier:test         # node --test over src/**/*.test.ts
npm run supplier:check-types  # tsc --noEmit, plus the scripts tsconfig
npm run supplier:build        # compile to dist/
npm run supplier:start        # run the compiled build
```

### Layout

| Path | What lives there |
| --- | --- |
| `src/index.ts` | Express wiring, and the fail-fast startup sequence |
| `src/config.ts` | Env parsing. Hard-requires `PAY_TO` and `SUPPLIER_SIGNING_KEY` at import time |
| `src/lib/pricing.ts` | The three price bands. Deliberately **not** in `config.ts` so a price can be read and tested without payment credentials |
| `src/routes/paidSearch.ts` | The shared metered-search route builder. All three searches are one instance each |
| `src/routes/booking.ts` | Whole-itinerary booking and the signed confirmation |
| `src/services/x402/server.ts` | The x402 resource server, route registration, and `withPayment` |
| `src/lib/quotes.ts` | Query-keyed quote cache that makes the 402 and the paid retry agree |
| `src/lib/*Cache.ts` | Read the generated JSON caches. Never fetch anything on the request path |
| `scripts/` | Data generators, `setup-env`, `preflight`, `inspect-data` |

### Adding a paid route

Every priced route must call `registerRoute()` at **import time**, before `index.ts` builds the
HTTP resource server. The library validates the whole route set against facilitator support
during initialisation, so a route registered afterwards would be silently unprotected;
`registerRoute` throws if you try. For a metered search, use `createPaidSearchRoute` rather than
re-deriving the part where money moves.

Handlers wrapped in `withPayment` run only after payment is verified, and settle only after the
handler succeeds. `withPayment` catches its own errors: Express 4 does not catch rejections from
an async handler, and one slow facilitator call was once enough to kill the process mid-demo.
