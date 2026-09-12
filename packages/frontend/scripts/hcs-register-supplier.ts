/**
 * One-time (or re-run after a card change) registration: fetches the supplier's live agent card
 * from GET /.well-known/x402 and submits an AgentRegistered event to the HCS registry topic
 * (HCS_REGISTRY_TOPIC_ID, created by scripts/hcs-create-registry-topic.ts), making the supplier
 * discoverable without a hardcoded SUPPLIER_BASE_URL.
 *
 * Also submits the identity claim proving the card's bookingPublicKey belongs to this agentId
 * (an HCS-14-style self-attestation) — the claim must be pre-signed inside packages/supplier,
 * since its private key never leaves that package:
 *
 *   cd packages/supplier && npm run sign-identity-claim > /tmp/claim.json
 *   cd packages/frontend && npx tsx scripts/hcs-register-supplier.ts /tmp/claim.json
 *
 * Reads AGENT_ACCOUNT_ID / AGENT_PRIVATE_KEY / SUPPLIER_BASE_URL / HCS_REGISTRY_TOPIC_ID from
 * packages/frontend/.env.
 */
import { AccountId, Client, PrivateKey, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import { AgentCard, AgentIdentityClaimed } from "@sh/contracts";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Minimal .env reader — the repo has no dotenv dependency and this is a throwaway script. */
function loadEnv(path: string): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    console.error(`Cannot read ${path}`);
    process.exit(1);
  }
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function need(env: Record<string, string>, key: string, file: string): string {
  const value = env[key];
  if (!value) {
    console.error(`Missing ${key} in ${file}`);
    process.exit(1);
  }
  return value;
}

async function submit(client: Client, topicId: string, event: unknown, label: string) {
  const receipt = await (
    await new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(JSON.stringify(event)).execute(client)
  ).getReceipt(client);
  console.log(`${label}: status=${receipt.status.toString()}`);
}

async function main() {
  const claimPath = process.argv[2];
  if (!claimPath) {
    console.error("Usage: tsx scripts/hcs-register-supplier.ts <signed-claim.json>");
    console.error("Generate the claim with: cd packages/supplier && npm run sign-identity-claim");
    process.exit(1);
  }

  const appEnv = loadEnv(resolve(HERE, "../.env"));
  const accountId = AccountId.fromString(need(appEnv, "AGENT_ACCOUNT_ID", "frontend/.env"));
  const privateKey = PrivateKey.fromStringECDSA(need(appEnv, "AGENT_PRIVATE_KEY", "frontend/.env"));
  const topicId = need(appEnv, "HCS_REGISTRY_TOPIC_ID", "frontend/.env");
  const supplierBaseUrl = appEnv.SUPPLIER_BASE_URL ?? "http://localhost:4100";

  const cardRes = await fetch(`${supplierBaseUrl}/.well-known/x402`);
  if (!cardRes.ok) throw new Error(`Failed to fetch agent card: ${cardRes.status}`);
  const card = AgentCard.parse(await cardRes.json());

  const claimRaw = JSON.parse(readFileSync(resolve(claimPath), "utf8"));
  const claim = AgentIdentityClaimed.parse(claimRaw);
  if (claim.agentId !== card.agentId || claim.publicKeyBase64 !== card.bookingPublicKey) {
    throw new Error("Identity claim does not match the fetched agent card (agentId/publicKeyBase64 mismatch)");
  }

  const client = Client.forTestnet().setOperator(accountId, privateKey);

  const registered = {
    type: "AgentRegistered" as const,
    v: 1 as const,
    timestamp: new Date().toISOString(),
    agentId: card.agentId,
    card,
  };

  await submit(client, topicId, registered, "AgentRegistered");
  await submit(client, topicId, claim, "AgentIdentityClaimed");

  console.log();
  console.log(`HashScan: https://hashscan.io/testnet/topic/${topicId}`);

  client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
