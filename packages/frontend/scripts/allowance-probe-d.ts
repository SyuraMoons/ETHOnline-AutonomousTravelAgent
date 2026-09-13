/**
 * Step 0b — follow-up to allowance-probe.ts.
 *
 * Probe A proved Hedera rejects an approved HBAR debit when a third party owns the
 * transaction id (SPENDER_DOES_NOT_HAVE_ALLOWANCE). Probe B proved it settles when the
 * SPENDER owns the transaction id.
 *
 * That kills the allowance design only if the facilitator must also be the transaction-id
 * account. It doesn't have to be: the facilitator's real job is to hold a key, co-sign, and
 * SUBMIT. This probe asks whether the network is happy when:
 *
 *   transaction id  = AGENT   (spender, so HAPI is satisfied and the agent pays the node fee)
 *   debit           = USER    (approved transfer under the allowance)
 *   credit          = PAYTO   (the supplier)
 *   signer          = AGENT
 *   submitter       = FACILITATOR (a different operator entirely)
 *
 * D1 submits with the facilitator adding its (superfluous) signature, mirroring what
 *    @x402/hedera's signAndSubmitTransaction actually does: `tx.sign(feePayerKey).execute()`.
 * D2 submits with no facilitator signature at all — just relaying the agent-signed bytes.
 *
 * If either settles, the allowance design survives and the only obstacle is a library-level
 * check (`transactionIdAccountId !== feePayer`) in a facilitator we self-host.
 *
 * Usage: npx tsx scripts/allowance-probe-d.ts
 */
import {
  AccountAllowanceApproveTransaction,
  AccountCreateTransaction,
  AccountId,
  Client,
  Hbar,
  PrivateKey,
  Status,
  TransactionId,
  TransferTransaction,
} from "@hiero-ledger/sdk";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

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

const PAYMENT = Hbar.fromTinybars(10_000_000); // 0.10 HBAR

async function main() {
  const rootEnv = loadEnv(resolve(HERE, "../../../.env"));
  const appEnv = loadEnv(resolve(HERE, "../.env"));
  const supplierEnv = loadEnv(resolve(HERE, "../../supplier/.env"));

  const facilitatorId = AccountId.fromString(need(rootEnv, "FACILITATOR_ACCOUNT_ID", ".env"));
  const facilitatorKey = PrivateKey.fromStringECDSA(need(rootEnv, "FACILITATOR_PRIVATE_KEY", ".env"));
  const agentId = AccountId.fromString(need(appEnv, "AGENT_ACCOUNT_ID", "frontend/.env"));
  const agentKey = PrivateKey.fromStringECDSA(need(appEnv, "AGENT_PRIVATE_KEY", "frontend/.env"));
  const payTo = AccountId.fromString(need(supplierEnv, "PAY_TO", "supplier/.env"));

  // The submitting client is operated by the FACILITATOR — a different account from the
  // one owning the transaction id. That separation is the whole question.
  const facilitatorClient = Client.forTestnet().setOperator(facilitatorId, facilitatorKey);

  const userKey = PrivateKey.generateECDSA();
  const userId = (
    await (
      await new AccountCreateTransaction()
        .setKeyWithoutAlias(userKey.publicKey)
        .setInitialBalance(new Hbar(3))
        .execute(facilitatorClient)
    ).getReceipt(facilitatorClient)
  ).accountId;
  if (!userId) {
    console.error("Account creation returned no accountId");
    process.exit(1);
  }
  console.log("user (owner)          :", userId.toString());
  console.log("agent (spender + txid):", agentId.toString());
  console.log("facilitator (submits) :", facilitatorId.toString());

  const approveTx = await new AccountAllowanceApproveTransaction()
    .approveHbarAllowance(userId, agentId, new Hbar(1))
    .freezeWith(facilitatorClient)
    .sign(userKey);
  const approved = await (await approveTx.execute(facilitatorClient)).getReceipt(facilitatorClient);
  console.log(`allowance 1 ℏ granted -> ${approved.status.toString()}\n`);

  const d1 = await attempt({
    label: "D1  txid=AGENT, agent-signed, facilitator CO-SIGNS and submits",
    facilitatorClient,
    userId,
    payTo,
    agentId,
    agentKey,
    coSignKey: facilitatorKey,
  });
  const d2 = await attempt({
    label: "D2  txid=AGENT, agent-signed, facilitator submits WITHOUT signing",
    facilitatorClient,
    userId,
    payTo,
    agentId,
    agentKey,
    coSignKey: null,
  });

  console.log("=".repeat(72));
  console.log(`${d1.padEnd(34)} D1 (facilitator co-signs)`);
  console.log(`${d2.padEnd(34)} D2 (facilitator relays only)`);
  console.log("=".repeat(72));

  if (d1 === "SUCCESS" || d2 === "SUCCESS") {
    console.log("\nVERDICT: the allowance design is ALIVE.");
    console.log("The network accepts an approved debit when the SPENDER owns the transaction id,");
    console.log("even though a different account submits it. The facilitator does not need to own");
    console.log("the transaction id to do its job — only @x402/hedera's own");
    console.log("`transactionIdAccountId !== feePayer` check stands in the way, and we self-host it.");
    if (d2 === "SUCCESS") console.log("D2 passing means the facilitator's signature isn't even required.");
  } else {
    console.log("\nVERDICT: dead end. Fall back to the one-time deposit model.");
  }

  facilitatorClient.close();
}

async function attempt(opts: {
  label: string;
  facilitatorClient: Client;
  userId: AccountId;
  payTo: AccountId;
  agentId: AccountId;
  agentKey: PrivateKey;
  coSignKey: PrivateKey | null;
}): Promise<string> {
  const { label, facilitatorClient, userId, payTo, agentId, agentKey, coSignKey } = opts;
  console.log(`--- ${label}`);
  try {
    const tx = new TransferTransaction()
      .addApprovedHbarTransfer(userId, PAYMENT.negated())
      .addHbarTransfer(payTo, PAYMENT)
      // The AGENT owns the transaction id, so HAPI sees the spender as the payer.
      .setTransactionId(TransactionId.generate(agentId))
      .freezeWith(facilitatorClient);

    let signed = await tx.sign(agentKey);
    if (coSignKey) signed = await signed.sign(coSignKey);

    // Transport round-trip, as x402 would do over HTTP.
    const rehydrated = TransferTransaction.fromBytes(signed.toBytes());
    const receipt = await (await rehydrated.execute(facilitatorClient)).getReceipt(facilitatorClient);
    const status = receipt.status.toString();
    console.log(`    => ${status}\n`);
    return status;
  } catch (err) {
    const status = (err as { status?: Status })?.status;
    const out = status
      ? `${status.toString()} (precheck)`
      : `ERROR: ${err instanceof Error ? err.message : String(err)}`;
    console.log(`    => ${out}\n`);
    return out;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
