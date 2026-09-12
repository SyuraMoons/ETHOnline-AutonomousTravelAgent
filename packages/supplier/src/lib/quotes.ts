import { canonicalJson } from "@sh/contracts";
import { createHash, randomUUID } from "node:crypto";
import { QUOTE_TTL_PAID_SECONDS, QUOTE_TTL_UNPAID_SECONDS } from "../config.js";
import { findFlights, type FlightQuery } from "./inventory.js";
import type { SearchResult } from "@sh/contracts";

type Quote = {
  quoteId: string;
  query: FlightQuery;
  results: SearchResult[];
  expiresAt: number; // epoch ms
  paid: boolean;
};

// In-memory, same pattern as packages/frontend/services/autovoyage/consentSessions.ts.
// Keyed by a hash of the normalised query so the x402 402 -> paid-retry pair
// (same URL, only a payment header added) always resolves to the same quote —
// the client never has to echo a token.
const quotes = new Map<string, Quote>();

function sweepExpired(): void {
  const now = Date.now();
  for (const [key, quote] of quotes) {
    if (quote.expiresAt < now) quotes.delete(key);
  }
}

function keyFor(query: FlightQuery): string {
  const canonical = canonicalJson({
    origin: query.origin.trim().toUpperCase(),
    destination: query.destination.trim().toUpperCase(),
    departDate: query.departDate,
    paxCount: query.paxCount,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Resolve (building if absent/expired) the quote for a query, at the unpaid TTL. */
export function getOrCreateQuote(query: FlightQuery): Quote {
  sweepExpired();
  const key = keyFor(query);
  const existing = quotes.get(key);
  if (existing) return existing;

  const quote: Quote = {
    quoteId: randomUUID(),
    query,
    results: findFlights(query),
    expiresAt: Date.now() + QUOTE_TTL_UNPAID_SECONDS * 1000,
    paid: false,
  };
  quotes.set(key, quote);
  return quote;
}

/** Extend a quote's TTL after successful payment. Returns the quote for convenience. */
export function markPaid(query: FlightQuery): Quote {
  const quote = getOrCreateQuote(query);
  quote.paid = true;
  quote.expiresAt = Date.now() + QUOTE_TTL_PAID_SECONDS * 1000;
  return quote;
}
