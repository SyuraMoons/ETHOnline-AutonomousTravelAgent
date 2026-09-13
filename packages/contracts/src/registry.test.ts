import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AgentIdentityClaimed,
  AgentRegistered,
  RegistryEvent,
} from "./registry.js";

const CARD = {
  agentId: "meridian-flight-data",
  name: "Meridian Flight Data",
  description: "x402-gated travel data on Hedera testnet.",
  payTo: "0.0.1234",
  bookingPublicKey:
    "MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=",
  services: [
    {
      id: "flight-search",
      name: "Flight Search",
      description: "Search cached flight inventory for a route.",
      endpoint: "http://localhost:4100/v1/flights/search",
      method: "GET",
      network: "hedera:testnet",
      pricing: "clamp(count x 0.05, 0.10, 2.50) HBAR",
    },
  ],
};

const REGISTERED = {
  type: "AgentRegistered",
  v: 1,
  timestamp: "2026-09-12T00:00:00.000Z",
  agentId: "meridian-flight-data",
  card: CARD,
};

const CLAIMED = {
  type: "AgentIdentityClaimed",
  v: 1,
  timestamp: "2026-09-12T00:00:01.000Z",
  agentId: "meridian-flight-data",
  publicKeyBase64:
    "MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=",
  signature:
    "d2hhdGV2ZXItdGhlLXNpZ25hdHVyZS1pcy1zaGFwZS1vbmx5LWhlcmUtbm90LXZlcmlmaWVk",
};

describe("AgentRegistered", () => {
  it("accepts a registration carrying a full agent card", () => {
    assert.ok(AgentRegistered.safeParse(REGISTERED).success);
  });

  // The registry topic is append-only and shared: audit events, replies and
  // outright junk land on it too. Every one of those must fail to parse, or the
  // reader folds a payment record into the supplier list and tries to buy from it.
  it("rejects an audit event that happens to share the topic", () => {
    assert.equal(
      AgentRegistered.safeParse({
        type: "DataPayment",
        v: 1,
        planId: "plan_demo",
        amountTinybar: "5000000",
      }).success,
      false,
    );
  });

  // A v2 writer is free to change what the fields mean. Parsing it under v1
  // rules would produce a plausible-looking entry that is quietly wrong, and a
  // topic cannot be edited to take it back.
  it("rejects a version it was not written to understand", () => {
    assert.equal(
      AgentRegistered.safeParse({ ...REGISTERED, v: 2 }).success,
      false,
    );
    assert.equal(
      AgentRegistered.safeParse({ ...REGISTERED, v: undefined }).success,
      false,
    );
    assert.equal(
      AgentRegistered.safeParse({ ...REGISTERED, v: "1" }).success,
      false,
    );
  });

  it("rejects a timestamp that is not an ISO datetime", () => {
    assert.equal(
      AgentRegistered.safeParse({ ...REGISTERED, timestamp: "2026-09-12" })
        .success,
      false,
    );
    assert.equal(
      AgentRegistered.safeParse({ ...REGISTERED, timestamp: undefined })
        .success,
      false,
    );
  });

  // payTo and services are the only two things a buyer actually needs: where to
  // send HBAR and what it can call. A card missing either is not discoverable,
  // so it must be refused here rather than surfaced as a usable supplier.
  it("rejects a card with nothing to pay or nothing to call", () => {
    const { payTo: _payTo, ...noPayTo } = CARD;
    assert.equal(
      AgentRegistered.safeParse({ ...REGISTERED, card: noPayTo }).success,
      false,
    );
    const { services: _services, ...noServices } = CARD;
    assert.equal(
      AgentRegistered.safeParse({ ...REGISTERED, card: noServices }).success,
      false,
    );
  });

  it("rejects a service advertising a verb the x402 client cannot issue", () => {
    assert.equal(
      AgentRegistered.safeParse({
        ...REGISTERED,
        card: {
          ...CARD,
          services: [{ ...CARD.services[0], method: "DELETE" }],
        },
      }).success,
      false,
    );
  });

  it("accepts a card with no bookingPublicKey, which only gates signed bookings", () => {
    const { bookingPublicKey: _key, ...unsigned } = CARD;
    assert.ok(
      AgentRegistered.safeParse({ ...REGISTERED, card: unsigned }).success,
    );
  });

  // Readers and writers are deployed separately and a topic is permanent, so a
  // newer writer adding a field must not make older readers drop the entry.
  it("tolerates a field a future writer added", () => {
    const parsed = AgentRegistered.safeParse({ ...REGISTERED, region: "apac" });
    assert.ok(parsed.success);
    assert.equal("region" in parsed.data, false);
  });
});

describe("AgentIdentityClaimed", () => {
  it("accepts a well-formed identity claim", () => {
    assert.ok(AgentIdentityClaimed.safeParse(CLAIMED).success);
  });

  // The claim is worth exactly its signature. If an unsigned or key-less message
  // parsed, it would reach the verifier as though it were a claim at all, and a
  // verifier that returns false on it looks indistinguishable from a forgery.
  it("rejects a claim with nothing to verify", () => {
    const { signature: _sig, ...unsigned } = CLAIMED;
    assert.equal(AgentIdentityClaimed.safeParse(unsigned).success, false);
    const { publicKeyBase64: _key, ...keyless } = CLAIMED;
    assert.equal(AgentIdentityClaimed.safeParse(keyless).success, false);
  });

  it("rejects a registration message reaching the claim schema", () => {
    assert.equal(AgentIdentityClaimed.safeParse(REGISTERED).success, false);
  });

  it("rejects a version it was not written to understand", () => {
    assert.equal(
      AgentIdentityClaimed.safeParse({ ...CLAIMED, v: 2 }).success,
      false,
    );
  });

  // HCS splits anything over 1KB into chunks that a reader has to reassemble
  // before it can verify anything. A claim is the one message that must stay
  // independently checkable, so it has to fit in a single message.
  it("stays inside a single unchunked topic message", () => {
    assert.ok(JSON.stringify(CLAIMED).length < 1024);
  });
});

describe("RegistryEvent", () => {
  it("routes each message to the member named by its type", () => {
    const registered = RegistryEvent.safeParse(REGISTERED);
    assert.ok(registered.success);
    assert.equal(registered.data.type, "AgentRegistered");

    const claimed = RegistryEvent.safeParse(CLAIMED);
    assert.ok(claimed.success);
    assert.equal(claimed.data.type, "AgentIdentityClaimed");
  });

  it("rejects a type it does not know", () => {
    assert.equal(
      RegistryEvent.safeParse({ ...REGISTERED, type: "AgentDeregistered" })
        .success,
      false,
    );
  });

  // Whatever a topic message decodes to is fed straight in. JSON.parse happily
  // returns a string, a number or null, and none of those may reach a `.type`
  // lookup as an exception instead of a skipped message.
  it("rejects anything that is not an object", () => {
    for (const junk of [null, "AgentRegistered", 1, [], undefined]) {
      assert.equal(RegistryEvent.safeParse(junk).success, false);
    }
  });
});
