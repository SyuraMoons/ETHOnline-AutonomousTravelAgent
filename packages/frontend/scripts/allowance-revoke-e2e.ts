/**
 * Proves the on-chain allowance is a real backstop, not decoration.
 *
 * The app-level mandate and the HIP-336 allowance are deliberately independent ceilings. This
 * checks the case that matters: the mandate still looks perfectly healthy, but the user has
 * revoked on-chain — the agent must then be unable to spend, enforced by Hedera rather than
 * by our own code.
 *
 * Requires facilitator (:4020, allowance mode), supplier (:4100), Next (:3000).
 *   npx tsx scripts/allowance-revoke-e2e.ts
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

async function plan(mandateId: string) {
  const res = await fetch(`${APP}/api/plan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mandateId,
      trip: { origin: "SIN", destination: "NRT", departDate: "2026-10-12", paxCount: 1 },
    }),
  });
  return (await res.json()) as { kind: string; reason?: string };
}

async function main() {
  const facEnv = loadEnv(resolve(HERE, "../../../facilitator/.env"));
  const client = Client.forTestnet().setOperator(
    facEnv.FACILITATOR_ACCOUNT_ID,
    PrivateKey.fromStringECDSA(facEnv.FACILITATOR_PRIVATE_KEY),
  );

  const agent = (await (await fetch(`${APP}/api/agent`)).json()) as { agentAccountId: string };
  const spender = AccountId.fromString(agent.agentAccountId);

  const userKey = PrivateKey.generateECDSA();
  const userId = (
    await (
      await new AccountCreateTransaction()
        .setKeyWithoutAlias(userKey.publicKey)
        .setInitialBalance(new Hbar(3))
        .execute(client)
    ).getReceipt(client)
  ).accountId!;

  const grant = await new AccountAllowanceApproveTransaction()
    .approveHbarAllowance(userId, spender, new Hbar(2))
    .freezeWith(client)
    .sign(userKey);
  await (await grant.execute(client)).getReceipt(client);
  console.log(`user ${userId.toString()} granted 2 ℏ allowance`);

  // A mandate with plenty of headroom and a long life — so that if spending is stopped
  // later, it is demonstrably the ALLOWANCE doing the stopping, not the mandate.
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
  ).json()) as { mandateId: string };

  const before = await plan(mandate.mandateId);
  console.log(`search while allowed: kind=${before.kind}${before.reason ? ` (${before.reason})` : ""}`);

  // --- revoke on-chain, leaving the mandate untouched ------------------------
  const revoke = await new AccountAllowanceApproveTransaction()
    .approveHbarAllowance(userId, spender, new Hbar(0))
    .freezeWith(client)
    .sign(userKey);
  console.log(`revoked -> ${(await (await revoke.execute(client)).getReceipt(client)).status.toString()}`);

  const mandateNow = (await (await fetch(`${APP}/api/mandate?mandateId=${mandate.mandateId}`)).json()) as {
    status: string;
    remainingHbar: number;
  };
  console.log(`mandate still says: status=${mandateNow.status} remaining=${mandateNow.remainingHbar} ℏ`);

  const after = await plan(mandate.mandateId);
  console.log(`search after revoke: kind=${after.kind}${after.reason ? ` (${after.reason})` : ""}`);

  console.log("\n" + "=".repeat(68));
  if (before.kind === "plan" && after.kind !== "plan") {
    console.log("PASS — revoking stopped the agent even though the mandate still had headroom.");
    console.log("The on-chain allowance is a genuine backstop.");
  } else if (before.kind !== "plan") {
    console.log(`INCONCLUSIVE — the first search did not succeed (${before.kind}/${before.reason}).`);
    process.exitCode = 1;
  } else {
    console.log("FAIL — the agent still spent after the allowance was revoked.");
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
