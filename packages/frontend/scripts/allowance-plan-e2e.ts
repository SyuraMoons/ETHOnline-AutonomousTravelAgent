/**
 * Full-stack check of the autonomous-spending flow through POST /api/plan.
 *
 * This is the closest thing to what the browser does, minus the wallet UI. It creates a
 * throwaway user, grants the on-chain allowance, mints a mandate bound to that user, then asks
 * the planner for a ROUND TRIP — two paid legs, both settled by the agent with no further user
 * involvement.
 *
 * Requires facilitator (:4020, allowance mode), supplier (:4100) and Next (:3000).
 *   npx tsx scripts/allowance-plan-e2e.ts
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
const APP = "http://localhost:3000";

function loadEnv(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

async function main() {
  const facEnv = loadEnv(resolve(HERE, "../../../facilitator/.env"));
  const client = Client.forTestnet().setOperator(
    facEnv.FACILITATOR_ACCOUNT_ID,
    PrivateKey.fromStringECDSA(facEnv.FACILITATOR_PRIVATE_KEY),
  );

  const agent = (await (await fetch(`${APP}/api/agent`)).json()) as { agentAccountId: string };
  console.log(`agent: ${agent.agentAccountId}`);

  // --- throwaway user + the single allowance signature ----------------------
  const userKey = PrivateKey.generateECDSA();
  const userId = (
    await (
      await new AccountCreateTransaction()
        .setKeyWithoutAlias(userKey.publicKey)
        .setInitialBalance(new Hbar(3))
        .execute(client)
    ).getReceipt(client)
  ).accountId!;
  console.log(`user:  ${userId.toString()}`);

  const approve = await new AccountAllowanceApproveTransaction()
    .approveHbarAllowance(userId, AccountId.fromString(agent.agentAccountId), new Hbar(2))
    .freezeWith(client)
    .sign(userKey);
  console.log(`allowance 2 ℏ -> ${(await (await approve.execute(client)).getReceipt(client)).status.toString()}`);

  // --- mint the mandate -----------------------------------------------------
  const mandate = (await (
    await fetch(`${APP}/api/mandate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        totalCeilingHbar: 2,
        perTxCeilingHbar: 1,
        ttlMinutes: 30,
        payerAccountId: userId.toString(),
      }),
    })
  ).json()) as { mandateId: string; payerAccountId?: string };

  console.log(`mandate: ${mandate.mandateId} payer=${mandate.payerAccountId}`);
  if (mandate.payerAccountId !== userId.toString()) {
    console.error("FAIL — mandate did not record the payer account");
    process.exit(1);
  }

  // --- the agent plans a ROUND TRIP: two paid legs, zero user interactions ---
  console.log("\nplanning round trip (two paid legs)…");
  const res = await fetch(`${APP}/api/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mandateId: mandate.mandateId,
      trip: { origin: "SIN", destination: "NRT", departDate: "2026-10-12", returnDate: "2026-10-19", paxCount: 1 },
    }),
  });
  const plan = (await res.json()) as {
    kind: string;
    reason?: string;
    payment?: {
      amountHbar: string;
      outbound: { transaction: string; amountHbar: string };
      inbound?: { transaction: string; amountHbar: string };
    };
    options?: unknown[];
  };

  if (plan.kind !== "plan" || !plan.payment) {
    console.error(`FAIL — expected a plan, got ${plan.kind}${plan.reason ? ` (${plan.reason})` : ""}`);
    console.error(JSON.stringify(plan).slice(0, 400));
    process.exit(1);
  }

  console.log(`options: ${plan.options?.length}`);
  console.log(`total paid: ${plan.payment.amountHbar} ℏ`);
  console.log(`  outbound ${plan.payment.outbound.amountHbar} ℏ  ${plan.payment.outbound.transaction}`);
  if (plan.payment.inbound) {
    console.log(`  inbound  ${plan.payment.inbound.amountHbar} ℏ  ${plan.payment.inbound.transaction}`);
  }

  // --- the mandate must reflect both legs -----------------------------------
  const after = (await (await fetch(`${APP}/api/mandate?mandateId=${mandate.mandateId}`)).json()) as {
    spentHbar: number;
    remainingHbar: number;
    spend: { amountHbar: number; transaction: string; payerAccountId: string }[];
  };
  console.log(
    `\nmandate spent ${after.spentHbar} ℏ, ${after.remainingHbar} ℏ left, ${after.spend.length} payment(s) logged`,
  );

  const bothFromUser = after.spend.length > 0 && after.spend.every(s => s.payerAccountId === userId.toString());

  console.log("\n" + "=".repeat(68));
  if (bothFromUser && plan.payment.inbound) {
    console.log("PASS — round trip paid from the USER's account, twice, with zero signatures.");
  } else {
    console.log(`FAIL — payers: ${after.spend.map(s => s.payerAccountId).join(", ") || "none"}`);
    process.exitCode = 1;
  }
  console.log("=".repeat(68));

  client.close();
  process.exit(process.exitCode ?? 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
