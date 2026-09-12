import { Router } from "express";
import { z } from "zod";
import { registerRoute, withPayment } from "../services/x402/server.js";
import { searchPriceTinybars, HBAR_ASSET } from "../config.js";
import { getOrCreateQuote, markPaid } from "../lib/quotes.js";
import type { FlightQuery } from "../lib/inventory.js";

export const flightsRouter = Router();

// clamp(resultCount * SEARCH_PRICE_PER_RESULT_HBAR, MIN, MAX). Query cache
// (lib/quotes.ts) keys the same query by hash so this price and the paid
// handler's `results` always agree — the client never echoes a token.
const QuerySchema = z.object({
  origin: z.string().min(1),
  destination: z.string().min(1),
  departDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "departDate must be YYYY-MM-DD"),
  paxCount: z.coerce.number().int().positive().default(1),
});

function parseQuery(rawQuery: Record<string, unknown>): { ok: true; query: FlightQuery } | { ok: false; error: string } {
  const parsed = QuerySchema.safeParse(rawQuery);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map(i => i.message).join("; ") };
  }
  return { ok: true, query: parsed.data };
}

registerRoute("GET /v1/flights/search", async context => {
  const getParam = (name: string) => {
    const value = context.adapter.getQueryParam?.(name);
    return typeof value === "string" ? value : undefined;
  };
  const rawQuery = {
    origin: getParam("origin"),
    destination: getParam("destination"),
    departDate: getParam("departDate"),
    paxCount: getParam("paxCount"),
  };
  const parsed = parseQuery(rawQuery);
  // A malformed query still needs a displayed price for the 402 body
  // (clamp(0) = the configured minimum) — but no money actually moves from
  // this: withPayment only calls processSettlement after the handler
  // succeeds, and the handler below rejects a malformed query with 400
  // before settlement runs, so a verified-but-invalid payment is never
  // submitted to the network.
  const resultCount = parsed.ok ? getOrCreateQuote(parsed.query).results.length : 0;
  return { asset: HBAR_ASSET, amount: searchPriceTinybars(resultCount).toString() };
});

flightsRouter.get(
  "/v1/flights/search",
  withPayment(async req => {
    const parsed = parseQuery(req.query as Record<string, unknown>);
    if (!parsed.ok) {
      return { error: parsed.error, status: 400 };
    }

    const quote = markPaid(parsed.query);
    return {
      body: {
        quoteId: quote.quoteId,
        expiresAt: new Date(quote.expiresAt).toISOString(),
        resultCount: quote.results.length,
        results: quote.results,
      },
    };
  }),
);
