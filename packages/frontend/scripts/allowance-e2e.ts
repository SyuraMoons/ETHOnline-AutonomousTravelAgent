/**
 * End-to-end check of the allowance payment path through the REAL x402 stack.
 *
 * Unlike scripts/allowance-probe*.ts (raw SDK, answering "does HAPI allow this?"), this
 * exercises the actual production code: services/x402/allowanceSigner.ts, the running
 * facilitator, and the running supplier's 402-gated search route.
 *
 * It creates a throwaway "user" account, grants the agent an allowance, then makes the agent
 * buy flight data. The assertion that matters: the settled transaction debits the USER, while
 * the user signed nothing but the one allowance approval.
 *
 * Requires: facilitator on :4020 in ALLOWANCE mode, supplier on :4100.
 *   npx tsx scripts/allowance-e2e.ts
 */
import {
  AccountAllowanceApproveTransaction,
  AccountCreateTransaction,
  AccountId,
  Client,
  Hbar,
  PrivateKey,
} from "@hiero-ledger/sdk";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const ALLOWANCE_HBAR = 2;

async function main() {
  const appEnv = loadEnv(resolve(HERE, "../.env"));
  const facEnv = loadEnv(resolve(HERE, "../../../facilitator/.env"));

  // agentBuyer reads these from process.env, so make the script's env the app's env.
  process.env.AGENT_ACCOUNT_ID ||= appEnv.AGENT_ACCOUNT_ID;
  process.env.AGENT_PRIVATE_KEY ||= appEnv.AGENT_PRIVATE_KEY;
  process.env.X402_NETWORK ||= appEnv.X402_NETWORK ?? "hedera:testnet";
  process.env.SUPPLIER_BASE_URL ||= appEnv.SUPPLIER_BASE_URL ?? "http://localhost:4100";

  const agentId = process.env.AGENT_ACCOUNT_ID!;
  const facilitatorId = facEnv.FACILITATOR_ACCOUNT_ID;
  const facilitatorKey = PrivateKey.fromStringECDSA(facEnv.FACILITATOR_PRIVATE_KEY);

  const advertised = (await (await fetch("http://localhost:4020/health")).json()) as {
    feePayer: string;
    mode: string;
  };
  console.log(`facilitator mode=${advertised.mode} advertisedFeePayer=${advertised.feePayer}`);
  if (advertised.feePayer !== agentId) {
    console.error(`\nFacilitator advertises ${advertised.feePayer} but the agent is ${agentId}.`);
    console.error(`Set FACILITATOR_ADVERTISED_FEE_PAYER=${agentId} in facilitator/.env and restart it.`);
    process.exit(1);
  }

  // --- throwaway user, funded by the facilitator ----------------------------
  const client = Client.forTestnet().setOperator(facilitatorId, facilitatorKey);
  const userKey = PrivateKey.generateECDSA();
  const userId = (
    await (
      await new AccountCreateTransaction()
        .setKeyWithoutAlias(userKey.publicKey)
        .setInitialBalance(new Hbar(3))
        .execute(client)
    ).getReceipt(client)
  ).accountId!;
  console.log(`user account: ${userId.toString()} (funded 3 ℏ)`);

  // --- the ONE signature the user ever makes --------------------------------
  const approve = await new AccountAllowanceApproveTransaction()
    .approveHbarAllowance(userId, AccountId.fromString(agentId), new Hbar(ALLOWANCE_HBAR))
    .freezeWith(client)
    .sign(userKey);
  const approveStatus = (await (await approve.execute(client)).getReceipt(client)).status.toString();
  console.log(`allowance ${ALLOWANCE_HBAR} ℏ -> ${approveStatus}\n`);

  // --- the agent now buys, with no further user involvement ------------------
  const { quoteSearch, paySearch } = await import("../services/autovoyage/supplierClient.js");

  const query = { origin: "SIN", destination: "NRT", departDate: "2026-10-12", paxCount: 1 };
  const quoted = await quoteSearch(query, userId.toString());
  const priceHbar = Number(quoted.quote.amountTinybars) / 1e8;
  console.log(`quoted: ${priceHbar} ℏ for ${query.origin}->${query.destination}`);

  const paid = await paySearch(quoted.url, quoted.quote);
  console.log(`settled: ${paid.transaction}`);
  console.log(`payer reported by facilitator: ${paid.payer}`);
  console.log(`results: ${paid.body.resultCount}`);

  // --- the assertion that this whole design exists for ----------------------
  console.log("\n" + "=".repeat(68));
  if (paid.payer === userId.toString()) {
    console.log("PASS — the USER's account was debited, and the user never signed a payment.");
  } else {
    console.log(`FAIL — expected payer ${userId.toString()}, got ${paid.payer}`);
    process.exitCode = 1;
  }
  console.log(`https://hashscan.io/testnet/transaction/${paid.transaction}`);
  console.log("=".repeat(68));

  client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
