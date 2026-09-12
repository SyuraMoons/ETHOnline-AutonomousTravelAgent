import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RegistryEntry, RegistryResponse } from "./registry.js";

const ENTRY = {
  type: "ServiceRegistered",
  v: 1,
  agentId: "meridian-flight-data",
  name: "Meridian Flight Data",
  origin: "http://localhost:4100",
  registeredAt: "2026-09-12T00:00:00.000Z",
};

describe("RegistryEntry", () => {
  it("accepts a registration", () => {
    assert.ok(RegistryEntry.safeParse(ENTRY).success);
  });

  // A shared topic carries other traffic; those messages must be skipped by the
  // reader, not parsed into a supplier.
  it("rejects an audit event that happens to share the topic", () => {
    assert.equal(
      RegistryEntry.safeParse({ type: "DataPayment", v: 1, planId: "p" })
        .success,
      false,
    );
  });

  it("rejects an unversioned or future-versioned entry", () => {
    assert.equal(RegistryEntry.safeParse({ ...ENTRY, v: 2 }).success, false);
    assert.equal(
      RegistryEntry.safeParse({ ...ENTRY, v: undefined }).success,
      false,
    );
  });

  it("rejects an origin that is not a URL", () => {
    assert.equal(
      RegistryEntry.safeParse({ ...ENTRY, origin: "localhost:4100" }).success,
      false,
    );
  });

  // Endpoints, pricing and payTo live on the agent card, not here: a topic
  // cannot be edited, so a price recorded on it would go stale and lie.
  it("carries no pricing or endpoints", () => {
    const parsed = RegistryEntry.parse({
      ...ENTRY,
      pricing: "0.05 HBAR",
      endpoint: "/v1/flights/search",
    });
    assert.equal("pricing" in parsed, false);
    assert.equal("endpoint" in parsed, false);
  });

  it("stays under the 1KB topic-message budget", () => {
    assert.ok(JSON.stringify(ENTRY).length < 1024);
  });
});

describe("RegistryResponse", () => {
  it("distinguishes a consensus read from the env fallback", () => {
    assert.ok(
      RegistryResponse.safeParse({
        source: "hcs",
        topicId: "0.0.123",
        suppliers: [ENTRY],
      }).success,
    );
    assert.ok(
      RegistryResponse.safeParse({
        source: "env",
        suppliers: [ENTRY],
        warning: "topic unset",
      }).success,
    );
  });

  it("refuses a source it does not know", () => {
    assert.equal(
      RegistryResponse.safeParse({ source: "cache", suppliers: [] }).success,
      false,
    );
  });
});
