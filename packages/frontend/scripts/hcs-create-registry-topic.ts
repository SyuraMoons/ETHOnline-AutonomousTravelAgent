/**
 * One-time setup: creates the real HCS topic the agent registry writes to
 * (scripts/hcs-register-supplier.ts) and prints its id to paste into HCS_REGISTRY_TOPIC_ID.
 *
 * Separate topic from the audit trail (see scripts/hcs-create-audit-topic.ts) — the registry
 * carries AgentRegistered/AgentIdentityClaimed events, the audit topic carries payment/consent/
 * booking events.
 *
 * Submit key = the agent's own key, so only this app can write registrations; Mirror Node reads
 * stay public regardless of the submit key.
 *
 * Usage:  npx tsx scripts/hcs-create-registry-topic.ts
 * Reads AGENT_ACCOUNT_ID / AGENT_PRIVATE_KEY from packages/frontend/.env.
 */
import { AccountId, Client, PrivateKey, TopicCreateTransaction } from "@hiero-ledger/sdk";
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

async function main() {
  const appEnv = loadEnv(resolve(HERE, "../.env"));
  const accountId = AccountId.fromString(need(appEnv, "AGENT_ACCOUNT_ID", "frontend/.env"));
  const privateKey = PrivateKey.fromStringECDSA(need(appEnv, "AGENT_PRIVATE_KEY", "frontend/.env"));

  const client = Client.forTestnet().setOperator(accountId, privateKey);

  const receipt = await (
    await new TopicCreateTransaction()
      .setSubmitKey(privateKey.publicKey)
      .setTopicMemo("Rayban agent registry")
      .execute(client)
  ).getReceipt(client);

  const topicId = receipt.topicId;
  if (!topicId) throw new Error("TopicCreateTransaction receipt did not include a topicId");

  console.log("HCS_REGISTRY_TOPIC_ID (put this in packages/frontend/.env):");
  console.log(topicId.toString());
  console.log();
  console.log(`HashScan: https://hashscan.io/testnet/topic/${topicId.toString()}`);

  client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
