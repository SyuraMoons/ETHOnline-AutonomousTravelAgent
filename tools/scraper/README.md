# Flight scraper

A standalone CLI that scrapes flight search results from a travel site and writes them to a
normalised JSON file. One command in, one file out. No server, no scheduler, no API.

It is **not** a workspace of the parent repo. It installs its own dependencies so Playwright and
its browser binaries never reach the repo root, and nothing outside this folder imports from it.

```bash
cd tools/scraper
npm install
npx playwright install chromium
```

## Usage

```bash
npm run scrape -- --route CGK-SIN --date 2026-11-12 --cabin economy
npm run scrape -- --all
npm run scrape -- --all --dry-run           # fetch, parse, validate, write nothing
npm run scrape -- --route CGK-SIN --headed  # visible browser, for debugging
npm run scrape -- --route CGK-SIN --sniff   # find the site's JSON endpoint
npm run scrape -- --route CGK-SIN --recipe-test
```

| Flag | Meaning | Default |
| --- | --- | --- |
| `--route` | `CGK-SIN` | required unless `--all` |
| `--date` | `YYYY-MM-DD` | `2026-11-12` |
| `--cabin` | `economy` \| `business` | `economy` |
| `--all` | every route × date × cabin in `src/routes.config.ts` | off |
| `--dry-run` | fetch and validate, write nothing | off |
| `--headed` | visible browser | off |
| `--out` | output directory | `./output` |
| `--source` | `xhr` \| `browser` \| `auto` | `auto` |
| `--concurrency` | parallel routes | `1` |
| `--site` | which `recipes/<site>.json` to use | `booking` |

## How it works

Two adapters behind one interface (`src/sources/types.ts`), tried in order under `--source auto`:

1. **`XhrSource`** — replays the site's own JSON endpoint with `fetch`. Fastest and most stable
   when it works: structured data, no browser, and a JSON payload changes far less often than
   markup. Driven entirely by `recipes/<site>.json`.
2. **`BrowserSource`** — Playwright. Two modes, preferring the first:
   - **capture** (`browser.capture`): load the page and read the JSON *the page itself* fetches.
     This gets the structured fields rendered cards omit — flight number, IATA carrier code, exact
     timestamps — without parsing any HTML.
   - **selectors** (`browser.selectors`): extract from the DOM. Last resort.

Whatever an adapter returns is site-shaped, so a per-site mapper in `src/mappers/` flattens it to
`RawFlight`, and `src/normalize.ts` then validates it into a `FlightRow` with zod. Invalid rows are
**dropped with a warning naming the field** — never coerced, because a silently coerced row looks
like data.

### Timezones

Local wall-clock times are converted to UTC using a hardcoded IATA→IANA map in
`src/routes.config.ts`. Getting this wrong produces negative durations, so `normalize.ts` asserts
`arriveUtc > departUtc` and that `durationMinutes` matches the delta within two minutes. A wrong
timezone fails loudly rather than writing a corrupt row.

### Partial rows

`refundable`, `baggageKg` and `fareBasis` are usually absent from a flight *search* response. A row
that falls back to a default for any of them is tagged `_meta.partial: true`, so a consumer can
tell "economy, no checked bag" from "we never found out".

## Output

```
output/raw/<route>-<date>-<cabin>.json   raw adapter output, verbatim
output/flights.json                      normalised, merged, deduped by id
output/scrape-log.json                   per run: timestamp, adapter, counts, failures
output/raw/fail-*.png / .html            page state when something went wrong
```

`output/` is gitignored in full. Copying results somewhere permanent is a deliberate manual step,
not this tool's job.

## Capturing a recipe

A recipe is **data, not code**: sites change their endpoints and their markup, and fixing that
should never mean editing TypeScript.

1. **Find the endpoint.** Run the sniffer:
   ```bash
   npm run scrape -- --route CGK-SIN --sniff
   ```
   It loads the page with a response listener and reports every JSON response over 1KB — URL,
   status, top-level keys, and the dot-paths to any arrays inside. It also saves a screenshot and
   the page HTML to `output/raw/`, which tells you at a glance whether you got results, a consent
   wall, or a bot challenge.

   If the Network tab is easier, do it by hand: DevTools → Network → filter Fetch/XHR → run a
   search → find the request returning the result array → **Copy as fetch**.

2. **Write `recipes/<site>.json`.** Template variables are substituted at call time:
   `{{origin}}`, `{{destination}}`, `{{date}}`, `{{cabin}}`, `{{cabinUpper}}`, `{{pax}}`,
   `{{originCountry}}`, `{{destinationCountry}}`, `{{originName}}`, `{{destinationCityName}}`.
   Secrets use `{{env.NAME}}` and are read from `.env.local` at call time, so **recipes stay safe
   to commit** — never paste a cookie or token into one.

   ```jsonc
   {
     "site": "example",
     "origin": "https://www.example.com",
     "xhr": {
       "method": "POST",
       "url": "https://www.example.com/api/v1/flight/search",
       "headers": { "content-type": "application/json" },
       "bodyTemplate": { "from": "{{origin}}", "to": "{{destination}}", "date": "{{date}}" },
       "resultsPath": "data.flights"          // dot-path to the results array
     },
     "browser": {
       "urlTemplate": "https://www.example.com/search?from={{origin}}&to={{destination}}",
       "capture": { "urlPattern": "/api/v1/flight/search", "resultsPath": "data.flights" },
       "selectors": {
         "resultContainer": "[data-testid='results']",
         "resultRow": "[data-testid='card']",
         "fields": { "carrierName": ".carrier", "departLocal": ".depart" }
       }
     }
   }
   ```

3. **Test it** without running the full job:
   ```bash
   npm run scrape -- --route CGK-SIN --recipe-test
   ```
   Fires the recipe once and pretty-prints the first raw row.

4. **Write a mapper.** Add `src/mappers/<site>.ts` converting one raw row to `RawFlight`, and
   register it in `src/mappers/index.ts`. That is the only TypeScript a new site needs.

If a recipe is missing or still contains placeholders, `XhrSource` fails immediately with a message
pointing here — it never falls through silently.

### `browser.warmup`

Some sites only resolve a deep-linked search once an ordinary session exists. `browser.warmup`
performs one real search through the site's own form, once per run, before any deep link is used.
Steps are a small data DSL (`click`, `fill` + `value`, `clickText` + `containing`, `waitMs`,
`optional`) so adapting to a redesigned search box means editing JSON, not code.

## Politeness, and what this tool will not do

- `robots.txt` is fetched per host at startup and is a **hard gate**. A disallowed path refuses the
  run and names the exact rule.
- If `robots.txt` comes back as something other than robots.txt — typically an HTML bot challenge —
  the tool **does not** read "no Disallow lines" as permission. It says so and consults the
  registrable parent domain's published rules instead.
- Sequential by default, with a randomised 2000–5000 ms delay between requests.
- Retries with backoff (2s, 6s, 15s) on network errors and 5xx.
- **Never** retries 403 or 429. That is a decision, not a transient fault; it is logged as a block,
  that route is skipped, and the run continues.
- No CAPTCHA solving, no proxy rotation, no fingerprint spoofing beyond a plain honest desktop
  User-Agent. **If a site blocks us, the answer is to pick a different site, not to fight it.**
- Cookies, tokens and auth headers are never committed. Recipes read secrets from `.env.local`.

## Adding a site

1. `npm run scrape -- --site <name> --route CGK-SIN --sniff`
2. Write `recipes/<name>.json`
3. Add `src/mappers/<name>.ts` and register it
4. Add any new airports to `AIRPORT_TZ`, `AIRPORT_COUNTRY`, `AIRPORT_NAME`, `CITY_NAME` in
   `src/routes.config.ts`

## Status: booking.com

The `booking` recipe is complete and correct — endpoint, URL format, capture path, mappers and
selectors were all captured from a real session. **It does not currently yield rows**, because
Booking.com blocks automated browsers at the API layer: the page HTML renders, but the site's own
`/api/autocomplete` and `/api/flights/` calls fail inside a fresh Playwright context, and the
search box shows *"Ups, terjadi kesalahan"*. Headed mode fails the same way.

Per the rules above that is a signal to change site, not to escalate. `output/raw/fail-*.png` shows
the failure exactly. Airline sites (Garuda, Citilink, AirAsia) are `robots.txt`-permissive and are
the intended next target.
