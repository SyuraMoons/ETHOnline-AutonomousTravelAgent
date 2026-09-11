// Entry point. One command in, one file out.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { log, politeDelay } from "./log.js";
import { loadRecipe, substitute } from "./recipe.js";
import { normalizeAll, type FlightRow } from "./normalize.js";
import { mapperFor } from "./mappers/index.js";
import {
  airportNameFor,
  allQueries,
  cityNameFor,
  countryFor,
  parseRoute,
  routeKey,
  DEFAULT_PAX,
  type Cabin,
  type RouteQuery,
} from "./routes.config.js";
import { browserSource, sniff } from "./sources/browser.js";
import { xhrSource } from "./sources/xhr.js";
import {
  BlockedError,
  RecipeError,
  type FlightSource,
} from "./sources/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = path.resolve(__dirname, "../output");

interface RouteOutcome {
  route: string;
  date: string;
  cabin: string;
  adapter: string | null;
  rowsFound: number;
  rowsKept: number;
  durationMs: number;
  error?: string;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      route: { type: "string" },
      date: { type: "string" },
      cabin: { type: "string" },
      all: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      headed: { type: "boolean", default: false },
      out: { type: "string" },
      source: { type: "string", default: "auto" },
      concurrency: { type: "string", default: "1" },
      site: { type: "string", default: "booking" },
      sniff: { type: "boolean", default: false },
      "recipe-test": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) return usage();

  const outDir = values.out ? path.resolve(values.out) : DEFAULT_OUT;
  const site = values.site ?? "booking";
  const sourceMode = values.source ?? "auto";
  if (!["xhr", "browser", "auto"].includes(sourceMode)) {
    throw new Error(
      `--source must be xhr, browser or auto (got "${sourceMode}")`,
    );
  }
  const concurrency = Number(values.concurrency ?? "1");
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(
      `--concurrency must be a positive integer (got "${values.concurrency}")`,
    );
  }
  if (concurrency > 1) {
    log.warn(
      `--concurrency ${concurrency}: parallel requests are far more likely to get us blocked`,
    );
  }

  // --sniff finds the JSON endpoint; it is recipe capture, not scraping.
  if (values.sniff) {
    const query = singleQuery(values);
    const recipe = loadRecipe(site);
    // Use the shared substituter, not hand-rolled replaces: String.replace with
    // a string pattern only swaps the FIRST match, and these templates repeat
    // {{origin}} in both the path and the query.
    const url = recipe.browser
      ? substitute(recipe.browser.urlTemplate, {
          origin: query.origin,
          destination: query.destination,
          date: query.date,
          cabin: query.cabin,
          cabinUpper: query.cabin.toUpperCase(),
          originCountry: countryFor(query.origin),
          destinationCountry: countryFor(query.destination),
          originName: airportNameFor(query.origin),
          destinationCityName: cityNameFor(query.destination),
          pax: String(query.pax),
        })
      : recipe.origin;
    const hits = await sniff(url, { headed: values.headed ?? false, outDir });
    reportSniff(hits, outDir);
    return;
  }

  if (values["recipe-test"]) {
    const query = singleQuery(values);
    const source = xhrSource(loadRecipe(site));
    log.step(
      `recipe test — ${source.name} — ${routeKey(query)} ${query.date} ${query.cabin}`,
    );
    const rows = await source.fetchRoute(query);
    log.info(`returned ${rows.length} raw row(s)`);
    if (rows.length > 0) console.log(JSON.stringify(rows[0], null, 2));
    else
      log.warn(
        "zero rows — check resultsPath and the request body against a saved response",
      );
    return;
  }

  const queries = values.all ? allQueries() : [singleQuery(values)];
  log.info(
    `${queries.length} quer${queries.length === 1 ? "y" : "ies"} · site "${site}" · source "${sourceMode}"`,
  );
  if (values["dry-run"]) log.warn("dry run — nothing will be written");

  const outcomes: RouteOutcome[] = [];
  const collected: FlightRow[] = [];
  const runOptions: RunOptions = {
    site,
    sourceMode,
    headed: values.headed ?? false,
    outDir,
    dryRun: values["dry-run"] ?? false,
  };

  // Built once so an adapter holding a browser keeps its warmed session across
  // every query instead of paying for a fresh one each time.
  const sources = adaptersFor(runOptions);
  try {
    for (const [index, query] of queries.entries()) {
      if (index > 0) await politeDelay();
      outcomes.push(await runQuery(query, runOptions, collected, sources));
    }
  } finally {
    for (const source of sources) await source.close?.();
  }

  if (!values["dry-run"]) writeOutputs(collected, outcomes, outDir);
  summarize(outcomes, collected.length, values["dry-run"] ?? false, outDir);
}

interface RunOptions {
  site: string;
  sourceMode: string;
  headed: boolean;
  outDir: string;
  dryRun: boolean;
}

async function runQuery(
  query: RouteQuery,
  options: RunOptions,
  collected: FlightRow[],
  sources: FlightSource[],
): Promise<RouteOutcome> {
  const started = Date.now();
  const label = `${routeKey(query)} ${query.date} ${query.cabin}`;
  log.step(`${label}`);

  const base: RouteOutcome = {
    route: routeKey(query),
    date: query.date,
    cabin: query.cabin,
    adapter: null,
    rowsFound: 0,
    rowsKept: 0,
    durationMs: 0,
  };

  for (const source of sources) {
    try {
      const raw = await source.fetchRoute(query);
      log.info(`${source.name}: ${raw.length} raw row(s)`);

      if (!options.dryRun) {
        mkdirSync(path.join(options.outDir, "raw"), { recursive: true });
        writeFileSync(
          path.join(
            options.outDir,
            "raw",
            `${routeKey(query)}-${query.date}-${query.cabin}.json`,
          ),
          `${JSON.stringify(raw, null, 2)}\n`,
        );
      }

      // Raw shape is site-specific; the mapper flattens it to RawFlight before
      // the generic normaliser validates it.
      const mapper = mapperFor(options.site);
      const { rows, dropped } = normalizeAll(raw.map(mapper), {
        query,
        sourceName: source.name,
        sourceUrl: sourceUrlFor(options.site),
      });
      if (dropped > 0) log.warn(`${dropped} row(s) dropped in normalisation`);
      collected.push(...rows);

      return {
        ...base,
        adapter: source.name,
        rowsFound: raw.length,
        rowsKept: rows.length,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (error instanceof BlockedError) {
        // A block ends this route. Partial success is the point of --all.
        log.error(`${source.name}: BLOCKED — ${message}`);
        return {
          ...base,
          adapter: source.name,
          durationMs: Date.now() - started,
          error: `blocked: ${message}`,
        };
      }
      if (error instanceof RecipeError) {
        log.warn(`${source.name} unavailable: ${message}`);
      } else {
        log.error(`${source.name} failed: ${message}`);
      }
      base.error = message;
    }
  }

  return { ...base, durationMs: Date.now() - started };
}

/** auto = XHR first, browser as fallback. */
function adaptersFor(options: RunOptions): FlightSource[] {
  const recipe = loadRecipe(options.site);
  const sources: FlightSource[] = [];
  const wantXhr = options.sourceMode === "xhr" || options.sourceMode === "auto";
  const wantBrowser =
    options.sourceMode === "browser" || options.sourceMode === "auto";

  // Construction throws on a missing/placeholder recipe section; that is a
  // reason to skip the adapter, not to abort the whole run.
  if (wantXhr) {
    try {
      sources.push(xhrSource(recipe));
    } catch (error) {
      if (options.sourceMode === "xhr") throw error;
      log.warn(
        `xhr adapter unavailable: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      );
    }
  }
  if (wantBrowser) {
    try {
      sources.push(
        browserSource(recipe, {
          headed: options.headed,
          outDir: options.outDir,
        }),
      );
    } catch (error) {
      if (options.sourceMode === "browser") throw error;
      log.warn(
        `browser adapter unavailable: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`,
      );
    }
  }
  if (sources.length === 0) {
    throw new Error(
      `No usable adapter for site "${options.site}". Capture a recipe — see README.`,
    );
  }
  return sources;
}

function sourceUrlFor(site: string): string {
  return loadRecipe(site).origin;
}

function singleQuery(values: Record<string, unknown>): RouteQuery {
  const route = values["route"] as string | undefined;
  if (!route)
    throw new Error("--route is required (e.g. --route CGK-SIN), or use --all");
  const date = (values["date"] as string | undefined) ?? "2026-11-12";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error(`--date must be YYYY-MM-DD (got "${date}")`);
  const cabin = ((values["cabin"] as string | undefined) ?? "economy") as Cabin;
  if (cabin !== "economy" && cabin !== "business")
    throw new Error(`--cabin must be economy or business (got "${cabin}")`);
  return { ...parseRoute(route), date, cabin, pax: DEFAULT_PAX };
}

function writeOutputs(
  rows: FlightRow[],
  outcomes: RouteOutcome[],
  outDir: string,
): void {
  mkdirSync(outDir, { recursive: true });

  // Merge with any previous run, deduped by id — last write wins, so a rerun
  // refreshes prices rather than duplicating rows.
  const flightsPath = path.join(outDir, "flights.json");
  const merged = new Map<string, FlightRow>();
  if (existsSync(flightsPath)) {
    try {
      for (const row of JSON.parse(
        readFileSync(flightsPath, "utf-8"),
      ) as FlightRow[])
        merged.set(row.id, row);
    } catch {
      log.warn("existing flights.json was unreadable — starting fresh");
    }
  }
  for (const row of rows) merged.set(row.id, row);

  writeFileSync(
    flightsPath,
    `${JSON.stringify([...merged.values()], null, 2)}\n`,
  );
  writeFileSync(
    path.join(outDir, "scrape-log.json"),
    `${JSON.stringify({ timestamp: new Date().toISOString(), outcomes }, null, 2)}\n`,
  );
}

function summarize(
  outcomes: RouteOutcome[],
  kept: number,
  dryRun: boolean,
  outDir: string,
): void {
  log.step("summary");
  for (const o of outcomes) {
    const time = `${(o.durationMs / 1000).toFixed(1)}s`;
    if (o.error)
      log.error(
        `${o.route} ${o.date} ${o.cabin}  FAILED (${time}) — ${o.error.split("\n")[0]}`,
      );
    else
      log.info(
        `${o.route} ${o.date} ${o.cabin}  ${o.rowsKept}/${o.rowsFound} rows via ${o.adapter} (${time})`,
      );
  }
  const failed = outcomes.filter((o) => o.error).length;
  log.info(
    `${outcomes.length - failed}/${outcomes.length} queries succeeded, ${kept} rows kept`,
  );
  if (dryRun) log.warn("dry run — nothing written");
  else log.info(`wrote ${path.join(outDir, "flights.json")}`);
}

function reportSniff(
  hits: ReturnType<typeof sniff> extends Promise<infer T> ? T : never,
  outDir: string,
): void {
  log.step(`sniff: ${hits.length} JSON response(s) over 1KB`);
  if (hits.length === 0) {
    log.warn(
      "nothing found — the page may render server-side, or we were blocked. Check the saved HTML.",
    );
    return;
  }
  for (const hit of hits.slice(0, 15)) {
    console.log(`\n  ${(hit.bytes / 1024).toFixed(1)}KB  HTTP ${hit.status}`);
    console.log(`  ${hit.url.slice(0, 160)}`);
    if (hit.topLevelKeys.length)
      console.log(`    keys:   ${hit.topLevelKeys.slice(0, 12).join(", ")}`);
    if (hit.arrayPaths.length)
      console.log(`    arrays: ${hit.arrayPaths.slice(0, 8).join(", ")}`);
  }
  log.info(
    `\nPick the endpoint whose array looks like flight results, then write recipes/<site>.json.`,
  );
  log.info(`Raw page HTML is in ${path.join(outDir, "raw")}.`);
}

function usage(): void {
  console.log(`
Flight scraper — one command in, one file out.

  npm run scrape -- --route CGK-SIN --date 2026-11-12 --cabin economy
  npm run scrape -- --all
  npm run scrape -- --all --dry-run
  npm run scrape -- --route CGK-SIN --headed
  npm run scrape -- --route CGK-SIN --sniff        find the JSON endpoint
  npm run scrape -- --route CGK-SIN --recipe-test  fire the recipe once

Flags:
  --route CGK-SIN       route to fetch
  --date YYYY-MM-DD     departure date            (default 2026-11-12)
  --cabin economy       economy | business        (default economy)
  --all                 every route x date x cabin in routes.config.ts
  --dry-run             fetch, parse, validate, write nothing
  --headed              visible browser, for debugging
  --out DIR             output directory          (default ./output)
  --source auto         xhr | browser | auto      (default auto)
  --concurrency N       parallel routes           (default 1)
  --site booking        which recipes/<site>.json to use
`);
}

main().catch((error: unknown) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
