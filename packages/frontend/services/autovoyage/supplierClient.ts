import type { ActivityOffer, AgentCard, SearchResult, StayOffer } from "@sh/contracts";
import { SupplierUnreachableError, fetchWithRetry, pay, quote as requestQuote } from "~~/services/x402/agentBuyer";
import type { PaidResult, Quote } from "~~/services/x402/agentBuyer";

/**
 * Server-side client for packages/supplier — the real x402-gated travel data
 * service. Never called from the browser; /api/plan is the only caller.
 *
 * Endpoints come from the agent card's services[], not from paths written here.
 * The card is the supplier's own statement of what it offers and where; hard-
 * coding a path means the planner keeps calling an endpoint the supplier may
 * have moved, and silently ignores services it has started offering. Discovery
 * that is fetched and then disregarded is not discovery.
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

  // Skip importing the registry reader entirely when no topic is configured — it pulls in
  // "server-only" (via mirrorNode.ts), which throws outside Next's server bundler, so an
  // unconfigured dev/test environment must never even load it.
  if (!process.env.HCS_REGISTRY_TOPIC_ID) {
    cachedBaseUrl = { url: envUrl, resolvedAt: Date.now() };
    return envUrl;
  }

  try {
    const { readRegistry } = await import("~~/services/hedera/registry");
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
  let res: Response;
  try {
    res = await fetchWithRetry(`${baseUrl}/.well-known/x402`, {});
  } catch (err) {
    throw new SupplierUnreachableError(err instanceof Error ? err.message : "fetch failed");
  }
  if (!res.ok) {
    throw new Error(`Supplier agent card request failed: ${res.status}`);
  }
  const card = (await res.json()) as AgentCard;
  cachedCard = { card, fetchedAt: Date.now() };
  return card;
}

/** Drops the cached card. Test seam, and a way to pick up a redeployed supplier. */
export function clearSupplierCardCache(): void {
  cachedCard = null;
}

/** Every metered search answers in this shape; only the row type differs. */
export type SupplierSearchResponse<R = SearchResult> = {
  quoteId: string;
  expiresAt: string;
  resultCount: number;
  results: R[];
};

/**
 * Looks up one advertised service's endpoint.
 *
 * Throws rather than falling back to a guessed path: a supplier that no longer
 * advertises a service has stopped offering it, and calling the old URL anyway
 * would either 404 or — worse — hit a route whose price has changed.
 */
export async function serviceEndpoint(serviceId: string): Promise<string> {
  const card = await getSupplierCard();
  const service = card.services.find(entry => entry.id === serviceId);
  if (!service) {
    const offered = card.services.map(entry => entry.id).join(", ") || "none";
    throw new Error(`Supplier "${card.agentId}" does not advertise "${serviceId}". It offers: ${offered}`);
  }
  return service.endpoint;
}

/** Appends query parameters, skipping anything the caller left undefined. */
function withParams(endpoint: string, params: Record<string, string | number | boolean | undefined>): string {
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export type SearchQuery = { origin: string; destination: string; departDate: string; paxCount: number };

export type StaySearchQuery = {
  city: string;
  checkIn: string;
  checkOut: string;
  guests?: number;
  minStars?: number;
  maxTotalMinor?: number;
};

export type ActivitySearchQuery = {
  city: string;
  date: string;
  pace?: "calm" | "balanced" | "adventurous";
  maxPriceMinor?: number;
  indoor?: boolean;
};

/**
 * Requests the real price for one directional search leg without paying yet.
 *
 * `payFrom` is the user account whose HIP-336 allowance funds the payment; omit it to
 * fall back to the agent's own treasury balance. It is bound into the returned Quote,
 * so pay() cannot settle against a different account than the one quoted.
 */
export async function quoteSearch(query: SearchQuery, payFrom?: string): Promise<{ url: string; quote: Quote }> {
  const url = withParams(await serviceEndpoint("flight-search"), {
    origin: query.origin,
    destination: query.destination,
    departDate: query.departDate,
    paxCount: query.paxCount,
  });
  return { url, quote: await requestQuote({ url, method: "GET", payFrom }) };
}

/** Same pay-after-quote shape as flights; see quoteSearch for the payFrom note. */
export async function quoteStaySearch(
  query: StaySearchQuery,
  payFrom?: string,
): Promise<{ url: string; quote: Quote }> {
  const url = withParams(await serviceEndpoint("stay-search"), { ...query });
  return { url, quote: await requestQuote({ url, method: "GET", payFrom }) };
}

export async function quoteActivitySearch(
  query: ActivitySearchQuery,
  payFrom?: string,
): Promise<{ url: string; quote: Quote }> {
  const url = withParams(await serviceEndpoint("activity-search"), { ...query });
  return { url, quote: await requestQuote({ url, method: "GET", payFrom }) };
}

/** Settles payment for a previously-quoted search and returns the paid results. */
export async function paySearch(url: string, quote: Quote): Promise<PaidResult<SupplierSearchResponse>> {
  return pay<SupplierSearchResponse>({ url, quote });
}

export async function payStaySearch(url: string, quote: Quote): Promise<PaidResult<SupplierSearchResponse<StayOffer>>> {
  return pay<SupplierSearchResponse<StayOffer>>({ url, quote });
}

export async function payActivitySearch(
  url: string,
  quote: Quote,
): Promise<PaidResult<SupplierSearchResponse<ActivityOffer>>> {
  return pay<SupplierSearchResponse<ActivityOffer>>({ url, quote });
}
