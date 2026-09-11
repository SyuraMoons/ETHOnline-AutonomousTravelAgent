// Replays the site's own internal JSON endpoint.
//
// Tried first, always. A site's own API returns structured data, changes far
// less often than its markup, and needs no browser — parsing rendered HTML is
// the fallback, not the plan.

import { log, politeDelay } from "../log.js";
import { assertAllowed, USER_AGENT } from "../robots.js";
import { assertUsable, resolvePath, substitute, type Recipe, type TemplateVars } from "../recipe.js";
import { airportNameFor, cityNameFor, countryFor, type RouteQuery } from "../routes.config.js";
import { BlockedError, type FlightSource } from "./types.js";

const RETRY_DELAYS_MS = [2000, 6000, 15000];

export function xhrSource(recipe: Recipe): FlightSource {
  assertUsable(recipe, "xhr");
  const spec = recipe.xhr!;

  return {
    name: `xhr:${recipe.site}`,

    async fetchRoute(query: RouteQuery): Promise<unknown[]> {
      const vars: TemplateVars = {
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

      const url = substitute(spec.url, vars);
      const headers = substitute(spec.headers, vars);
      const body = spec.bodyTemplate === undefined ? undefined : substitute(spec.bodyTemplate, vars);

      await assertAllowed(url);

      const payload = await requestWithRetry(url, {
        method: spec.method,
        headers: { ...headers, "user-agent": USER_AGENT },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      const rows = resolvePath(payload, spec.resultsPath);
      if (!Array.isArray(rows)) {
        throw new Error(
          `resultsPath "${spec.resultsPath}" did not resolve to an array. ` +
            `Top-level keys were: ${describeKeys(payload)}. ` +
            `Re-check the path against a saved response — see README "Capturing a recipe".`,
        );
      }
      return rows;
    },
  };
}

function describeKeys(payload: unknown): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return Object.keys(payload).slice(0, 12).join(", ") || "(none)";
  }
  return Array.isArray(payload) ? "(array)" : typeof payload;
}

async function requestWithRetry(url: string, init: RequestInit): Promise<unknown> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      const wait = RETRY_DELAYS_MS[attempt - 1]!;
      log.detail(`retry ${attempt}/${RETRY_DELAYS_MS.length} in ${wait / 1000}s`);
      await new Promise(resolve => setTimeout(resolve, wait));
    }

    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });

      // A block is a decision, not a transient fault. Never retried: hammering
      // a host that just said no is exactly the behaviour that earns a ban.
      if (response.status === 403 || response.status === 429) {
        throw new BlockedError(`host refused the request (HTTP ${response.status})`, response.status);
      }
      if (response.status >= 500) {
        lastError = new Error(`upstream error HTTP ${response.status}`);
        continue;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof BlockedError) throw error;
      lastError = error;
      const transient = error instanceof Error && /network|timeout|abort|fetch failed|ECONN/i.test(error.message);
      if (!transient) throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export { politeDelay };
