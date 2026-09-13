import { clearSupplierCardCache, serviceEndpoint } from "./supplierClient.js";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

/**
 * Covers endpoint discovery: the planner must take its URLs from the supplier's
 * advertised services[], not from paths written into the client.
 *
 * The paid HTTP path needs a live facilitator and is exercised end-to-end at
 * bring-up; what is worth pinning here is that discovery is actually used, and
 * that an unadvertised service fails loudly rather than being guessed at.
 */

const CARD = {
  agentId: "meridian-flight-data",
  name: "Meridian Flight Data",
  description: "test",
  payTo: "0.0.1234",
  services: [
    {
      id: "flight-search",
      name: "Flight Search",
      description: "",
      endpoint: "http://supplier.test/v1/flights/search",
      method: "GET",
      network: "hedera:testnet",
    },
    {
      id: "flight-booking",
      name: "Flight Booking",
      description: "",
      endpoint: "http://supplier.test/v1/booking",
      method: "POST",
      network: "hedera:testnet",
    },
    {
      id: "stay-search",
      name: "Stay Search",
      description: "",
      endpoint: "http://supplier.test/v1/stays/search",
      method: "GET",
      network: "hedera:testnet",
    },
    {
      id: "activity-search",
      name: "Activity Search",
      description: "",
      endpoint: "http://supplier.test/v1/activities/search",
      method: "GET",
      network: "hedera:testnet",
    },
  ],
};

const realFetch = globalThis.fetch;
let fetchCount = 0;

function stubCard(card: unknown): void {
  fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return { ok: true, json: async () => card } as Response;
  }) as typeof fetch;
}

beforeEach(() => {
  clearSupplierCardCache();
  stubCard(CARD);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  clearSupplierCardCache();
});

describe("service discovery", () => {
  it("resolves every advertised service to its own endpoint", async () => {
    assert.equal(await serviceEndpoint("flight-search"), "http://supplier.test/v1/flights/search");
    assert.equal(await serviceEndpoint("stay-search"), "http://supplier.test/v1/stays/search");
    assert.equal(await serviceEndpoint("activity-search"), "http://supplier.test/v1/activities/search");
    assert.equal(await serviceEndpoint("flight-booking"), "http://supplier.test/v1/booking");
  });

  it("takes the URL from the card, not from a path in the client", async () => {
    // A supplier that moves a route must be followed, not second-guessed.
    clearSupplierCardCache();
    stubCard({
      ...CARD,
      services: [{ ...CARD.services[0]!, endpoint: "https://meridian.example.com/v2/air/search" }],
    });
    assert.equal(await serviceEndpoint("flight-search"), "https://meridian.example.com/v2/air/search");
  });

  it("fetches the card once and caches it", async () => {
    await serviceEndpoint("flight-search");
    await serviceEndpoint("stay-search");
    await serviceEndpoint("activity-search");
    assert.equal(fetchCount, 1);
  });

  // Falling back to a guessed path would either 404 or, worse, hit a route
  // whose price has since changed.
  it("refuses to guess at a service the supplier does not advertise", async () => {
    clearSupplierCardCache();
    stubCard({ ...CARD, services: [CARD.services[0]!] });
    await assert.rejects(() => serviceEndpoint("stay-search"), /does not advertise "stay-search"/);
  });

  it("names what is actually on offer when a lookup fails", async () => {
    clearSupplierCardCache();
    stubCard({ ...CARD, services: [CARD.services[0]!, CARD.services[2]!] });
    await assert.rejects(() => serviceEndpoint("activity-search"), /flight-search, stay-search/);
  });

  it("reports an empty catalogue clearly", async () => {
    clearSupplierCardCache();
    stubCard({ ...CARD, services: [] });
    await assert.rejects(() => serviceEndpoint("flight-search"), /It offers: none/);
  });
});
