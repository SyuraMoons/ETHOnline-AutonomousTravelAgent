import { canonicalJson } from "@sh/contracts";
import { createHash, randomUUID } from "node:crypto";
import { QUOTE_TTL_PAID_SECONDS, QUOTE_TTL_UNPAID_SECONDS } from "./pricing.js";

/**
 * A priced, cached answer to one search.
 *
 * The whole point is that the 402 challenge and the paid retry resolve to the
 * SAME rows. The buyer is quoted on a row count, so if the count moved between
 * the challenge and the response they would have paid for something other than
 * what they got.
 */
export interface Quote<Q, R> {
  quoteId: string;
  query: Q;
  results: R[];
  expiresAt: number; // epoch ms
  paid: boolean;
}

export interface QuoteCacheOptions<Q, R> {
  /**
   * Mixed into the cache key so two domains can never collide. A stays query
   * and a flights query can be structurally identical once normalised, and
   * serving one from the other's quote would hand a buyer the wrong rows.
   */
  namespace: string;
  /** Produces the rows for a query. Called once per quote, not per request. */
  resolve: (query: Q) => R[];
  /**
   * The fields that identify a query, normalised. Anything omitted here is
   * treated as not affecting the results — so a field that DOES affect them
   * must be included, or two different searches will share one quote.
   */
  identity: (query: Q) => Record<string, unknown>;
}

export interface QuoteCache<Q, R> {
  getOrCreate: (query: Q) => Quote<Q, R>;
  markPaid: (query: Q) => Quote<Q, R>;
  /** Test seam. */
  clear: () => void;
  size: () => number;
}

/**
 * In-memory quote store for one domain.
 *
 * Keyed by a hash of the normalised query so the x402 402 -> paid-retry pair
 * (same URL, only a payment header added) always resolves to the same quote —
 * the client never has to echo a token back, and so can never tamper with one.
 */
export function createQuoteCache<Q, R>(
  options: QuoteCacheOptions<Q, R>,
): QuoteCache<Q, R> {
  const { namespace, resolve, identity } = options;
  const quotes = new Map<string, Quote<Q, R>>();

  function sweepExpired(): void {
    const now = Date.now();
    for (const [key, quote] of quotes) {
      if (quote.expiresAt < now) quotes.delete(key);
    }
  }

  function keyFor(query: Q): string {
    const canonical = canonicalJson({ namespace, ...identity(query) });
    return createHash("sha256").update(canonical).digest("hex");
  }

  function getOrCreate(query: Q): Quote<Q, R> {
    sweepExpired();
    const key = keyFor(query);
    const existing = quotes.get(key);
    if (existing) return existing;

    const quote: Quote<Q, R> = {
      quoteId: randomUUID(),
      query,
      results: resolve(query),
      expiresAt: Date.now() + QUOTE_TTL_UNPAID_SECONDS * 1000,
      paid: false,
    };
    quotes.set(key, quote);
    return quote;
  }

  /** Extends a quote's TTL after successful payment. */
  function markPaid(query: Q): Quote<Q, R> {
    const quote = getOrCreate(query);
    quote.paid = true;
    quote.expiresAt = Date.now() + QUOTE_TTL_PAID_SECONDS * 1000;
    return quote;
  }

  return {
    getOrCreate,
    markPaid,
    clear: () => quotes.clear(),
    size: () => quotes.size,
  };
}
