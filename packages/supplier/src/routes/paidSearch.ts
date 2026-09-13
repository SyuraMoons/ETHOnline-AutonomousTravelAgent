import { Router } from "express";
import type { z } from "zod";
import { HBAR_ASSET } from "../config.js";
import { priceTinybars, type PriceBandName } from "../lib/pricing.js";
import type { QuoteCache } from "../lib/quotes.js";
import { registerRoute, withPayment } from "../services/x402/server.js";

/**
 * Builds one metered, x402-gated search route.
 *
 * Every paid search has the same four beats: read the query off the request,
 * resolve the quote it names, declare a price for the 402 body, and serve the
 * rows once payment settles. Writing that out per domain would mean each new
 * domain re-deriving the part where money moves, which is the last place worth
 * duplicating.
 *
 * The price and the response come from the SAME quote, so the count a buyer is
 * charged for is always the count they receive.
 */

export interface PaidSearchRoute<Q, R> {
  /** Express path, also the pattern registered with the x402 resource server. */
  path: string;
  /** Validates and coerces the raw query string. */
  schema: z.ZodType<Q, z.ZodTypeDef, unknown>;
  /** Query-string parameter names to read off the request. */
  params: readonly string[];
  cache: QuoteCache<Q, R>;
  band: PriceBandName;
  /** Shapes the paid response body. */
  toBody: (quote: {
    quoteId: string;
    expiresAt: number;
    results: R[];
  }) => unknown;
}

export function createPaidSearchRoute<Q, R>(
  route: PaidSearchRoute<Q, R>,
): Router {
  const { path, schema, params, cache, band, toBody } = route;

  function parse(
    raw: Record<string, unknown>,
  ): { ok: true; query: Q } | { ok: false; error: string } {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      };
    }
    return { ok: true, query: parsed.data };
  }

  registerRoute(`GET ${path}`, async (context) => {
    const raw: Record<string, unknown> = {};
    for (const name of params) {
      const value = context.adapter.getQueryParam?.(name);
      raw[name] = typeof value === "string" ? value : undefined;
    }
    const parsed = parse(raw);
    // A malformed query still needs a displayed price for the 402 body
    // (clamp(0) is the configured floor), but no money moves from it:
    // withPayment only settles after the handler succeeds, and the handler
    // rejects a malformed query with 400 first. A verified-but-invalid payment
    // is therefore never submitted to the network.
    const resultCount = parsed.ok
      ? cache.getOrCreate(parsed.query).results.length
      : 0;
    return {
      asset: HBAR_ASSET,
      amount: priceTinybars(band, resultCount).toString(),
    };
  });

  const router = Router();
  router.get(
    path,
    withPayment(async (req) => {
      const parsed = parse(req.query as Record<string, unknown>);
      if (!parsed.ok) {
        return { error: parsed.error, status: 400 };
      }
      const quote = cache.markPaid(parsed.query);
      return { body: toBody(quote) };
    }),
  );
  return router;
}
