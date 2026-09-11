// Playwright fallback, used when the XHR endpoint is signed, encrypted, or
// otherwise not replayable.
//
// Also hosts --sniff, which is how a recipe gets captured in the first place:
// it watches every JSON response the page makes and reports the ones big
// enough to be a result set. That turns "hunt through the Network tab" into a
// short list of candidate endpoints.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { log } from "../log.js";
import { assertAllowed, USER_AGENT } from "../robots.js";
import {
  assertUsable,
  resolvePath,
  substitute,
  type Recipe,
  type TemplateVars,
} from "../recipe.js";
import {
  airportNameFor,
  cityNameFor,
  countryFor,
  type RouteQuery,
} from "../routes.config.js";
import { type FlightSource } from "./types.js";

const RESULT_TIMEOUT_MS = 30_000;
const VIEWPORT = { width: 1440, height: 900 };

export interface BrowserOptions {
  headed: boolean;
  outDir: string;
}

async function launch(headed: boolean): Promise<Browser> {
  return chromium.launch({ headless: !headed });
}

async function newPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent: USER_AGENT,
    locale: "id-ID",
    extraHTTPHeaders: { "accept-language": "id-ID,id;q=0.9,en;q=0.8" },
  });
  return context.newPage();
}

function templateVars(query: RouteQuery): TemplateVars {
  return {
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
  };
}

export function browserSource(
  recipe: Recipe,
  options: BrowserOptions,
): FlightSource {
  assertUsable(recipe, "browser");
  const spec = recipe.browser!;

  // One browser for the whole run: the warm-up session is what makes deep links
  // resolve, so throwing it away between queries would mean repeating a full
  // form search every time — slower for us and more load on the site.
  let browser: Browser | null = null;
  let page: Page | null = null;
  let warmed = false;

  async function ensurePage(query: RouteQuery): Promise<Page> {
    if (!browser) browser = await launch(options.headed);
    if (!page) page = await newPage(browser);

    if (spec.warmup && !warmed) {
      await runWarmup(page, spec.warmup, templateVars(query), options.outDir);
      warmed = true;
    }
    return page;
  }

  return {
    name: `browser:${recipe.site}`,

    async close(): Promise<void> {
      await browser?.close();
      browser = null;
      page = null;
      warmed = false;
    },

    async fetchRoute(query: RouteQuery): Promise<unknown[]> {
      const url = substitute(spec.urlTemplate, templateVars(query));
      await assertAllowed(url);

      const active = await ensurePage(query);

      // Preferred path: let the page make its own API call and read the
      // result. More robust than markup, and it yields the structured fields
      // (flight number, carrier code, exact times) that rendered cards omit.
      if (spec.capture) {
        const { urlPattern, resultsPath, timeoutMs } = spec.capture;
        const waiting = active
          .waitForResponse(
            (response) =>
              response.url().includes(urlPattern) && response.status() === 200,
            {
              timeout: timeoutMs,
            },
          )
          .catch(() => null);

        await active.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: RESULT_TIMEOUT_MS,
        });
        const response = await waiting;

        if (!response) {
          await dumpFailure(
            active,
            options.outDir,
            `${query.origin}-${query.destination}-${query.date}`,
          );
          throw new Error(
            `no response matching "${urlPattern}" within ${timeoutMs / 1000}s. ` +
              `Screenshot and HTML saved to ${options.outDir} — check whether the endpoint moved or the search returned nothing.`,
          );
        }

        const payload: unknown = await response.json();
        const rows = resolvePath(payload, resultsPath);
        if (!Array.isArray(rows)) {
          throw new Error(
            `capture.resultsPath "${resultsPath}" did not resolve to an array in ${urlPattern}. ` +
              `Top-level keys: ${payload && typeof payload === "object" ? Object.keys(payload).slice(0, 12).join(", ") : typeof payload}`,
          );
        }
        return rows;
      }

      if (!spec.selectors) {
        throw new Error(
          `recipe "${recipe.site}" has neither browser.capture nor browser.selectors`,
        );
      }
      const selectors = spec.selectors;

      await active.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: RESULT_TIMEOUT_MS,
      });
      try {
        await active.waitForSelector(selectors.resultContainer, {
          timeout: RESULT_TIMEOUT_MS,
        });
      } catch {
        // The difference between a five-minute selector fix and an hour of
        // guessing is having the page as it actually looked.
        await dumpFailure(
          active,
          options.outDir,
          `${query.origin}-${query.destination}-${query.date}`,
        );
        throw new Error(
          `result container "${selectors.resultContainer}" never appeared within ${RESULT_TIMEOUT_MS / 1000}s. ` +
            `Screenshot and HTML saved to ${options.outDir} — check whether the selector changed or we were blocked.`,
        );
      }

      return await active.$$eval(
        selectors.resultRow,
        (rows, fieldMap: Record<string, string>) =>
          rows.map((row) => {
            const out: Record<string, string | null> = {};
            for (const [name, selector] of Object.entries(fieldMap)) {
              const el = row.querySelector(selector);
              // null, not "", so normalize can tell "absent" from "empty".
              out[name] = el ? (el.textContent ?? "").trim() || null : null;
            }
            return out;
          }),
        selectors.fields,
      );
    },
  };
}

type WarmupSpec = NonNullable<NonNullable<Recipe["browser"]>["warmup"]>;

/**
 * Performs one real search through the site's own form.
 *
 * Steps are data in the recipe, not code here, so adapting to a redesigned
 * search box never means editing TypeScript.
 */
async function runWarmup(
  page: Page,
  warmup: WarmupSpec,
  vars: TemplateVars,
  outDir: string,
): Promise<void> {
  log.detail(`warming up session via a real search on ${warmup.url}`);
  await assertAllowed(warmup.url);
  await page.goto(warmup.url, {
    waitUntil: "domcontentloaded",
    timeout: RESULT_TIMEOUT_MS,
  });
  await page.waitForTimeout(3000);

  for (const [index, step] of warmup.steps.entries()) {
    const label = `step ${index + 1}/${warmup.steps.length}`;
    try {
      if (step.waitMs) {
        await page.waitForTimeout(step.waitMs);
      } else if (step.click) {
        await page.locator(step.click).first().click({ timeout: step.optional ? 4000 : 15_000 });
      } else if (step.clickText && step.containing) {
        const text = substitute(step.containing, vars);
        await page
          .locator(step.clickText)
          .filter({ hasText: text })
          .first()
          .click({ timeout: 15_000 });
      } else if (step.fill && step.value !== undefined) {
        const value = substitute(step.value, vars);
        // Set through the native setter so React's onChange actually fires;
        // assigning .value directly is swallowed by controlled inputs.
        await page.locator(step.fill).first().fill(value, { timeout: 15_000 });
      } else {
        throw new Error("step has no recognised action");
      }
    } catch (error) {
      if (step.optional) {
        log.detail(`${label} skipped (optional, did not match)`);
        continue;
      }
      // Same reasoning as a failed extraction: without the page as it actually
      // looked, fixing a warm-up step is guesswork.
      await dumpFailure(page, outDir, `warmup-step${index + 1}`);
      throw new Error(
        `warm-up ${label} failed (${JSON.stringify(step)}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  await page.waitForTimeout(5000);
  log.detail("warm-up search complete");
}

async function dumpFailure(
  page: Page,
  outDir: string,
  label: string,
): Promise<void> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(outDir, "raw", `fail-${label}-${stamp}`);
  mkdirSync(path.dirname(base), { recursive: true });
  try {
    await page.screenshot({ path: `${base}.png`, fullPage: true });
    writeFileSync(`${base}.html`, await page.content());
    log.warn(`saved failure artifacts: ${base}.png / .html`);
  } catch (error) {
    log.warn(
      `could not save failure artifacts: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export interface SniffHit {
  url: string;
  status: number;
  bytes: number;
  topLevelKeys: string[];
  arrayPaths: string[];
}

/**
 * Loads a page and reports every JSON response over 1KB.
 *
 * This is recipe capture, semi-automated: the output is the shortlist of
 * endpoints worth inspecting, with the array paths inside each already found,
 * which is the part that is tedious to do by eye in the Network tab.
 */
export async function sniff(
  url: string,
  options: BrowserOptions,
  dwellMs = 25_000,
): Promise<SniffHit[]> {
  await assertAllowed(url);

  const hits: SniffHit[] = [];
  const browser = await launch(options.headed);

  try {
    const page = await newPage(browser);

    page.on("response", (response) => {
      void (async () => {
        try {
          const type = response.headers()["content-type"] ?? "";
          if (!type.includes("json")) return;
          const body = await response.text();
          if (body.length < 1024) return;

          const parsed: unknown = JSON.parse(body);
          hits.push({
            url: response.url(),
            status: response.status(),
            bytes: body.length,
            topLevelKeys:
              parsed && typeof parsed === "object" && !Array.isArray(parsed)
                ? Object.keys(parsed)
                : [],
            arrayPaths: findArrayPaths(parsed),
          });
        } catch {
          // A body we cannot read or parse is simply not a candidate.
        }
      })();
    });

    log.info(`sniffing ${url}`);
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: RESULT_TIMEOUT_MS,
    });
    log.detail(`waiting ${dwellMs / 1000}s for XHR traffic to settle`);
    await page.waitForTimeout(dwellMs);

    // Save the final DOM too: if nothing useful showed up, this says whether we
    // got a results page, a consent wall, or a bot challenge.
    mkdirSync(path.join(options.outDir, "raw"), { recursive: true });
    const base = path.join(
      options.outDir,
      "raw",
      `sniff-${new Date().toISOString().replace(/[:.]/g, "-")}`,
    );
    writeFileSync(`${base}.html`, await page.content());
    // A screenshot answers "did we get results, a consent wall, or a bot
    // challenge?" in one glance — the HTML alone rarely does.
    await page.screenshot({ path: `${base}.png`, fullPage: false });
    log.detail(`page saved to ${base}.html / .png`);
  } finally {
    await browser.close();
  }

  return hits.sort((a, b) => b.bytes - a.bytes);
}

/** Finds dot-paths to arrays of objects — the shape a result set has. */
function findArrayPaths(node: unknown, prefix = "", depth = 0): string[] {
  if (depth > 5 || node === null || typeof node !== "object") return [];
  const found: string[] = [];
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const dotPath = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) {
      if (
        value.length > 0 &&
        typeof value[0] === "object" &&
        value[0] !== null
      ) {
        found.push(`${dotPath}[${value.length}]`);
      }
      if (value.length > 0)
        found.push(...findArrayPaths(value[0], `${dotPath}.0`, depth + 1));
    } else if (value && typeof value === "object") {
      found.push(...findArrayPaths(value, dotPath, depth + 1));
    }
  }
  return found;
}
