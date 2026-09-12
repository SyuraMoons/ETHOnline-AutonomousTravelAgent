import type { AgentCard, SearchResult } from "@sh/contracts";
import { readRegistry } from "~~/services/hedera/registry";
import { pay, quote as requestQuote } from "~~/services/x402/agentBuyer";
import type { PaidResult, Quote } from "~~/services/x402/agentBuyer";

/**
 * Server-side client for packages/supplier — the real x402-gated flight
 * data service. Never called from the browser; /api/plan is the only caller.
 */

const SUPPLIER_AGENT_ID = "meridian-flight-data";
const BASE_URL_TTL_MS = 5 * 60_000;

let cachedBaseUrl: { url: string; resolvedAt: number } | null = null;

/**
 * Resolves the supplier's endpoint by discovering it on the HCS registry (see
 * services/hedera/registry.ts) first, falling back to the static SUPPLIER_BASE_URL env var if
 * the registry has no verified entry yet. Registry data is eventually consistent via Mirror
 * Node, so this must never block the golden path — any registry read failure falls back too.
 */
async function resolveSupplierBaseUrl(): Promise<string> {
  if (cachedBaseUrl && Date.now() - cachedBaseUrl.resolvedAt < BASE_URL_TTL_MS) {
    return cachedBaseUrl.url;
  }

  const envUrl = process.env.SUPPLIER_BASE_URL ?? "http://localhost:4100";

  try {
    const { entries } = await readRegistry();
    const entry = entries.find(e => e.agentId === SUPPLIER_AGENT_ID);
    const searchService = entry?.card.services.find(s => s.id === "flight-search");
    if (entry?.identity?.verified && searchService) {
      const url = new URL(searchService.endpoint).origin;
      cachedBaseUrl = { url, resolvedAt: Date.now() };
      return url;
    }
  } catch (err) {
    console.warn("[supplierClient] registry discovery failed, falling back to SUPPLIER_BASE_URL", err);
  }

  cachedBaseUrl = { url: envUrl, resolvedAt: Date.now() };
  return envUrl;
}

let cachedCard: { card: AgentCard; fetchedAt: number } | null = null;
const CARD_TTL_MS = 5 * 60_000;

/** Cached read of the supplier's agent card (payTo, display name, pricing). */
export async function getSupplierCard(): Promise<AgentCard> {
  if (cachedCard && Date.now() - cachedCard.fetchedAt < CARD_TTL_MS) {
    return cachedCard.card;
  }
  const baseUrl = await resolveSupplierBaseUrl();
  const res = await fetch(`${baseUrl}/.well-known/x402`);
  if (!res.ok) {
    throw new Error(`Supplier agent card request failed: ${res.status}`);
  }
  const card = (await res.json()) as AgentCard;
  cachedCard = { card, fetchedAt: Date.now() };
  return card;
}

export type SupplierSearchResponse = {
  quoteId: string;
  expiresAt: string;
  resultCount: number;
  results: SearchResult[];
};

async function searchUrl(query: {
  origin: string;
  destination: string;
  departDate: string;
  paxCount: number;
}): Promise<string> {
  const params = new URLSearchParams({
    origin: query.origin,
    destination: query.destination,
    departDate: query.departDate,
    paxCount: String(query.paxCount),
  });
  const baseUrl = await resolveSupplierBaseUrl();
  return `${baseUrl}/v1/flights/search?${params.toString()}`;
}

export type SearchQuery = { origin: string; destination: string; departDate: string; paxCount: number };

/**
 * Requests the real price for one directional search leg without paying yet.
 *
 * `payFrom` is the user account whose HIP-336 allowance funds the payment; omit it to
 * fall back to the agent's own treasury balance. It is bound into the returned Quote,
 * so pay() cannot settle against a different account than the one quoted.
 */
export async function quoteSearch(query: SearchQuery, payFrom?: string): Promise<{ url: string; quote: Quote }> {
  const url = await searchUrl(query);
  return { url, quote: await requestQuote({ url, method: "GET", payFrom }) };
}

/** Settles payment for a previously-quoted search and returns the paid results. */
export async function paySearch(url: string, quote: Quote): Promise<PaidResult<SupplierSearchResponse>> {
  return pay<SupplierSearchResponse>({ url, quote });
}
