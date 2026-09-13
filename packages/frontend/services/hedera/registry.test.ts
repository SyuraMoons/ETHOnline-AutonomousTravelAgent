import { canonicalJson } from "@sh/contracts";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";

/**
 * Covers the registry reader and, through it, the Ed25519 verification of an
 * AgentIdentityClaimed message — the one piece of this package that decides
 * whether a stranger's self-attested identity is real. `verifySignedClaim` is
 * module-private, so every assertion below reads `entry.identity.verified`,
 * which is that function's return value verbatim. A verifier stuck on `true`
 * fails the tampering cases here.
 *
 * Mirror Node is reached with plain `fetch`, so the topic is stubbed rather
 * than mocked; nothing about the fold-and-verify path is stubbed out.
 */

// services/hedera/* is `import "server-only"`, which throws outside a React
// Server Component. Neutering it is the only way to exercise this module under
// the node test runner, and it must happen before the dynamic import below.
const nodeRequire = createRequire(import.meta.url);
const serverOnlyId = nodeRequire.resolve("server-only");
nodeRequire.cache[serverOnlyId] = {
  id: serverOnlyId,
  filename: serverOnlyId,
  loaded: true,
  exports: {},
  children: [],
  paths: [],
} as unknown as NodeModule;

let readRegistry: (typeof import("./registry.js"))["readRegistry"];

const AGENT_ID = "meridian-flight-data";
const TOPIC_ID = "0.0.5551234";
const CLAIMED_AT = "2026-09-12T00:00:01.000Z";

const supplierKeys = generateKeyPairSync("ed25519");
const otherKeys = generateKeyPairSync("ed25519");

const publicKeyBase64 = (key: typeof supplierKeys.publicKey): string =>
  key.export({ format: "der", type: "spki" }).toString("base64");

const SUPPLIER_PUBLIC_KEY = publicKeyBase64(supplierKeys.publicKey);

const card = (agentId = AGENT_ID) => ({
  agentId,
  name: "Meridian Flight Data",
  description: "x402-gated travel data on Hedera testnet.",
  payTo: "0.0.1234",
  bookingPublicKey: SUPPLIER_PUBLIC_KEY,
  services: [
    {
      id: "flight-search",
      name: "Flight Search",
      description: "Search cached flight inventory for a route.",
      endpoint: "http://supplier.test/v1/flights/search",
      method: "GET",
      network: "hedera:testnet",
    },
  ],
});

const registered = (agentId = AGENT_ID, timestamp = "2026-09-12T00:00:00.000Z") => ({
  type: "AgentRegistered",
  v: 1,
  timestamp,
  agentId,
  card: card(agentId),
});

/**
 * Signs the claim body honestly, then applies `tamper` to the published message.
 * Anything overridden after signing is exactly what an attacker can change in
 * flight, so the signature must stop covering it.
 */
function claim(tamper: Record<string, unknown> = {}, key = supplierKeys.privateKey) {
  const body = {
    agentId: AGENT_ID,
    publicKeyBase64: SUPPLIER_PUBLIC_KEY,
    v: 1 as const,
    timestamp: CLAIMED_AT,
  };
  const signature = sign(null, Buffer.from(canonicalJson(body), "utf8"), key).toString("base64");
  return { type: "AgentIdentityClaimed", ...body, signature, ...tamper };
}

const realFetch = globalThis.fetch;
const realTopicId = process.env.HCS_REGISTRY_TOPIC_ID;

/** Serves `messages` as one Mirror Node page, base64-encoded the way HCS returns them. */
function stubTopic(messages: unknown[]): void {
  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        messages: messages.map((m, i) => ({
          consensus_timestamp: `${1757000000 + i}.000000000`,
          message: Buffer.from(typeof m === "string" ? m : JSON.stringify(m), "utf8").toString("base64"),
          sequence_number: i + 1,
        })),
        links: { next: null },
      }),
    }) as Response) as typeof fetch;
}

before(async () => {
  process.env.HCS_REGISTRY_TOPIC_ID = TOPIC_ID;
  ({ readRegistry } = await import("./registry.js"));
});

after(() => {
  globalThis.fetch = realFetch;
  if (realTopicId === undefined) delete process.env.HCS_REGISTRY_TOPIC_ID;
  else process.env.HCS_REGISTRY_TOPIC_ID = realTopicId;
});

const identityOf = async (messages: unknown[]) => {
  stubTopic(messages);
  const { entries } = await readRegistry();
  return entries.find(e => e.agentId === AGENT_ID)?.identity ?? null;
};

describe("identity claim verification", () => {
  it("accepts a claim actually signed by the key it names", async () => {
    const identity = await identityOf([registered(), claim()]);
    assert.equal(identity?.verified, true);
    assert.equal(identity?.publicKeyBase64, SUPPLIER_PUBLIC_KEY);
    assert.equal(identity?.claimedAt, CLAIMED_AT);
  });

  // The whole point of re-verifying: the registry writer is not trusted, so a
  // field edited between signing and publication has to break the signature.
  // If any of these pass, the claim is decoration and anyone can mint one.
  it("refuses a claim whose timestamp was changed after signing", async () => {
    const identity = await identityOf([registered(), claim({ timestamp: "2026-09-12T00:00:02.000Z" })]);
    assert.equal(identity?.verified, false);
  });

  it("refuses a v1 claim whose signature was made over a different version", async () => {
    const signedAsV2 = canonicalJson({
      agentId: AGENT_ID,
      publicKeyBase64: SUPPLIER_PUBLIC_KEY,
      v: 2,
      timestamp: CLAIMED_AT,
    });
    const downgraded = {
      ...claim(),
      signature: sign(null, Buffer.from(signedAsV2, "utf8"), supplierKeys.privateKey).toString("base64"),
    };
    const identity = await identityOf([registered(), downgraded]);
    assert.equal(identity?.verified, false);
  });

  // The impostor registers a card of their own and republishes Meridian's
  // signature under their agentId. agentId is signed, so the lift must fail.
  it("refuses a signature lifted onto another agent's claim", async () => {
    stubTopic([registered("impostor"), { ...claim(), agentId: "impostor" }]);
    const { entries } = await readRegistry();
    assert.equal(entries.find(e => e.agentId === "impostor")?.identity?.verified, false);
  });

  it("refuses a claim signed by a key other than the one it publishes", async () => {
    const identity = await identityOf([registered(), claim({}, otherKeys.privateKey)]);
    assert.equal(identity?.verified, false);
  });

  it("refuses a claim that swaps in a different public key after signing", async () => {
    const identity = await identityOf([registered(), claim({ publicKeyBase64: publicKeyBase64(otherKeys.publicKey) })]);
    assert.equal(identity?.verified, false);
  });

  // Everything here is attacker-controlled bytes off a public topic. A throw
  // would take down GET /api/registry and hide every other supplier with it,
  // so unusable input has to come back as an unverified claim, not an error.
  it("returns unverified rather than throwing on unusable signature material", async () => {
    for (const junk of [
      { publicKeyBase64: "this is not base64 DER" },
      { publicKeyBase64: "" },
      { signature: "!!!not base64!!!" },
      { signature: "" },
    ]) {
      const identity = await identityOf([registered(), claim(junk)]);
      assert.equal(identity?.verified, false, `expected unverified for ${JSON.stringify(junk)}`);
    }
  });
});

describe("reading the registry topic", () => {
  // A registry topic carries the audit trail's neighbours, replies and plain
  // junk. Anything unrecognised must be skipped silently — one bad message
  // must never cost the reader the suppliers published around it.
  it("skips messages that are not registry events", async () => {
    stubTopic([
      { type: "DataPayment", v: 1, planId: "plan_demo", amountTinybar: "5000000" },
      "not json at all",
      { hello: "world" },
      registered(),
      claim(),
    ]);
    const { entries } = await readRegistry();
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.agentId, AGENT_ID);
    assert.equal(entries[0]?.identity?.verified, true);
  });

  // A v2 registration means fields this reader does not understand. Dropping
  // the agent is correct: better undiscoverable than discovered wrongly.
  it("skips a registration written to a version it does not understand", async () => {
    stubTopic([{ ...registered(), v: 2 }]);
    const { entries } = await readRegistry();
    assert.deepEqual(entries, []);
  });

  it("reports an agent with no claim as having no identity, not a failed one", async () => {
    stubTopic([registered()]);
    const { entries } = await readRegistry();
    assert.equal(entries[0]?.identity, null);
  });

  // A claim on its own says a key exists; it says nothing about where to buy.
  it("does not surface an agent that has only claimed an identity", async () => {
    stubTopic([claim()]);
    const { entries } = await readRegistry();
    assert.deepEqual(entries, []);
  });

  // Re-registering is how a supplier moves; the topic is append-only, so the
  // last card on it has to win or the agent is pinned to a dead endpoint.
  it("takes the latest card when an agent re-registers", async () => {
    const moved = registered(AGENT_ID, "2026-09-13T00:00:00.000Z");
    moved.card.services[0]!.endpoint = "https://meridian.example.com/v2/air/search";
    stubTopic([registered(), moved]);
    const { entries } = await readRegistry();
    assert.equal(entries[0]?.card.services[0]?.endpoint, "https://meridian.example.com/v2/air/search");
  });

  it("reads nothing and calls nothing when no registry topic is configured", async () => {
    delete process.env.HCS_REGISTRY_TOPIC_ID;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("Mirror Node must not be called without a topic id");
    }) as typeof fetch;
    const result = await readRegistry();
    process.env.HCS_REGISTRY_TOPIC_ID = TOPIC_ID;
    assert.deepEqual(result, { topicId: null, entries: [] });
    assert.equal(called, false);
  });
});
