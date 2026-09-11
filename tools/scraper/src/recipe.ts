// Recipe loading and template substitution.
//
// A recipe captures a real request I observed in DevTools. It is deliberately
// data, not code: sites change their endpoints and their markup, and fixing
// that should never mean editing TypeScript.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { RecipeError } from "./sources/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RECIPES_DIR = path.resolve(__dirname, "../recipes");

export const Recipe = z.object({
  site: z.string(),
  /** Host used for the robots.txt gate and for building browser URLs. */
  origin: z.string().url(),
  xhr: z
    .object({
      method: z.enum(["GET", "POST"]),
      url: z.string(),
      headers: z.record(z.string()),
      bodyTemplate: z.unknown().optional(),
      /** Dot-path to the results array inside the response, e.g. "data.flights". */
      resultsPath: z.string(),
    })
    .optional(),
  browser: z
    .object({
      /** Search page URL, templated the same way as the XHR url. */
      urlTemplate: z.string(),
      /**
       * A real search performed through the site's own form, once per run,
       * before any deep link is used.
       *
       * Some sites only resolve a deep-linked search once an ordinary session
       * exists — Booking.com silently substitutes an unrelated destination on a
       * cold context, which looks like a successful search returning nothing.
       * Driving the form is what an actual visitor does; it forges no token and
       * defeats no check. Once the session exists, deep links resolve normally
       * and the remaining queries cost one page load each.
       */
      warmup: z
        .object({
          url: z.string(),
          steps: z.array(
            z.object({
              /** Click the first element matching this selector. */
              click: z.string().optional(),
              /** Set an input's value (templated) and fire an input event. */
              fill: z.string().optional(),
              value: z.string().optional(),
              /** Click whichever match contains this (templated) text. */
              clickText: z.string().optional(),
              containing: z.string().optional(),
              waitMs: z.number().int().positive().optional(),
              /** Skip silently if it does not match — e.g. clearing a
               *  pre-filled field that is only sometimes populated. */
              optional: z.boolean().optional(),
            }),
          ),
        })
        .optional(),
      /**
       * Preferred browser strategy: load the page and read the JSON the page
       * itself fetches, instead of parsing rendered HTML.
       *
       * This exists because many sites gate their API behind a JS challenge
       * that a bare fetch cannot pass. Letting the real browser make the site's
       * own request is not a workaround — it is the page doing its normal work
       * while we read the result. We never forge or replay a challenge token.
       *
       * When absent, the adapter falls back to the DOM selectors below.
       */
      capture: z
        .object({
          /** Substring matched against response URLs, e.g. "/api/flights/". */
          urlPattern: z.string(),
          /** Dot-path to the results array inside that response. */
          resultsPath: z.string(),
          timeoutMs: z.number().int().positive().default(45000),
        })
        .optional(),
      selectors: z
        .object({
          /** Waited on before extraction; its absence means "no results yet". */
          resultContainer: z.string(),
          resultRow: z.string(),
          /** Field selectors, relative to a row. Missing ones yield a partial row. */
          fields: z.record(z.string()),
        })
        .optional(),
    })
    .optional(),
});
export type Recipe = z.infer<typeof Recipe>;

const PLACEHOLDER = /REPLACE_ME|<[A-Z_]+>|example-travel/;

export function loadRecipe(site: string): Recipe {
  const file = path.join(RECIPES_DIR, `${site}.json`);
  if (!existsSync(file)) {
    throw new RecipeError(
      `No recipe at recipes/${site}.json.\n` +
        `  Capture one first — see "Capturing a recipe" in tools/scraper/README.md.\n` +
        `  Or run with --source browser to skip the XHR path entirely.`,
    );
  }

  const parsed = Recipe.safeParse(JSON.parse(readFileSync(file, "utf-8")));
  if (!parsed.success) {
    throw new RecipeError(
      `recipes/${site}.json does not match the recipe schema:\n` +
        parsed.error.issues
          .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
          .join("\n"),
    );
  }
  return parsed.data;
}

/** Fails loudly rather than firing a request full of REPLACE_ME. */
export function assertUsable(recipe: Recipe, part: "xhr" | "browser"): void {
  const section = recipe[part];
  if (!section) {
    throw new RecipeError(
      `recipes/${recipe.site}.json has no "${part}" section.\n` +
        `  See "Capturing a recipe" in tools/scraper/README.md.`,
    );
  }
  if (PLACEHOLDER.test(JSON.stringify(section))) {
    throw new RecipeError(
      `recipes/${recipe.site}.json still contains placeholder values in "${part}".\n` +
        `  It ships as a template — capture a real request before running.\n` +
        `  See "Capturing a recipe" in tools/scraper/README.md.`,
    );
  }
}

export interface TemplateVars {
  origin: string;
  destination: string;
  date: string;
  cabin: string;
  /** Some sites want the cabin enum upper-cased (ECONOMY, BUSINESS). */
  cabinUpper: string;
  originCountry: string;
  destinationCountry: string;
  originName: string;
  destinationCityName: string;
  pax: string;
  [key: string]: string;
}

/**
 * Substitutes {{origin}}, {{date}}, ... and {{env.NAME}}.
 *
 * Secrets are read from the environment at call time and never live in the
 * recipe file, so recipes stay safe to commit.
 */
export function substitute<T>(value: T, vars: TemplateVars): T {
  if (typeof value === "string") {
    return value.replace(/\{\{([\w.]+)\}\}/g, (whole, key: string) => {
      if (key.startsWith("env.")) {
        const name = key.slice(4);
        const fromEnv = process.env[name];
        if (fromEnv === undefined) {
          throw new RecipeError(
            `Recipe needs ${whole}, but ${name} is not set. Add it to tools/scraper/.env.local.`,
          );
        }
        return fromEnv;
      }
      const replacement = vars[key];
      if (replacement === undefined) {
        throw new RecipeError(
          `Recipe references ${whole}, which is not a known template variable.`,
        );
      }
      return replacement;
    }) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => substitute(item, vars)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        substitute(v, vars),
      ]),
    ) as T;
  }
  return value;
}

/** Walks a dot-path like "data.flights" or "results.0.itineraries". */
export function resolvePath(payload: unknown, dotPath: string): unknown {
  return dotPath.split(".").reduce<unknown>((node, key) => {
    if (node === null || node === undefined) return undefined;
    if (Array.isArray(node)) {
      const index = Number(key);
      return Number.isInteger(index) ? node[index] : undefined;
    }
    if (typeof node === "object") return (node as Record<string, unknown>)[key];
    return undefined;
  }, payload);
}
