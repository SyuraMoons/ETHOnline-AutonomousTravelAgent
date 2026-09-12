/**
 * Step 0 feasibility probe — can the agent spend HBAR from a user's account via a
 * HIP-336 allowance, while a THIRD PARTY (the x402 facilitator) is the fee payer?
 *
 * This is the single unknown that gates the "one allowance approval, then autonomous
 * spending" design. x402 requires the transaction id to be generated from the
 * facilitator's account (see services/x402/walletSigner.ts and the facilitator-side
 * `invalid_exact_hedera_payload_fee_payer_mismatch` check). The bundled protobufs say
 * `senderAccountID` MUST be the payer only for NftTransfer, and say nothing for the
 * HBAR `AccountAmount` — so the rule has to be settled on testnet, not by reading.
 *
 * Deliberately raw @hiero-ledger/sdk, no x402 layer, so a failure gives an unambiguous
 * HAPI status instead of a wrapped scheme error.
 *
 * Runs three cases:
 *   A  approved transfer, fee payer = FACILITATOR   <- the one x402 actually needs
 *   B  approved transfer, fee payer = AGENT (spender)  <- control: is allowance itself fine?
 *   C  over-allowance transfer, fee payer per whichever of A/B worked <- is the ceiling enforced?
 *
 * Usage:  npx tsx scripts/allowance-probe.ts
 * Reads credentials from ../../.env (facilitator) and .env (agent), and creates its own
 * throwaway "user" account funded from the facilitator.
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

/** The supplier's cheapest real search costs 0.10 HBAR; probe with the same order of magnitude. */
const PAYMENT = Hbar.fromTinybars(10_000_000); // 0.10 HBAR
const ALLOWANCE = new Hbar(1);
const USER_INITIAL_BALANCE = new Hbar(3);

type Case = { name: string; feePayer: AccountId; amount: Hbar; expectation: string };

async function main() {
  const rootEnv = loadEnv(resolve(HERE, "../../../.env"));
  const appEnv = loadEnv(resolve(HERE, "../.env"));
  const supplierEnv = loadEnv(resolve(HERE, "../../supplier/.env"));

  const facilitatorId = AccountId.fromString(need(rootEnv, "FACILITATOR_ACCOUNT_ID", ".env"));
  const facilitatorKey = PrivateKey.fromStringECDSA(need(rootEnv, "FACILITATOR_PRIVATE_KEY", ".env"));
  const agentId = AccountId.fromString(need(appEnv, "AGENT_ACCOUNT_ID", "frontend/.env"));
  const agentKey = PrivateKey.fromStringECDSA(need(appEnv, "AGENT_PRIVATE_KEY", "frontend/.env"));
  const payTo = AccountId.fromString(need(supplierEnv, "PAY_TO", "supplier/.env"));

  // Operator is the facilitator: it funds account creation and submits every transfer,
  // exactly as it does when settling a real x402 payment.
  const client = Client.forTestnet().setOperator(facilitatorId, facilitatorKey);

  console.log("facilitator (fee payer) :", facilitatorId.toString());
  console.log("agent       (spender)   :", agentId.toString());
  console.log("payTo       (supplier)  :", payTo.toString());

  // --- Create a throwaway "user" account -----------------------------------
  const userKey = PrivateKey.generateECDSA();
  const createReceipt = await (
    await new AccountCreateTransaction()
      .setKeyWithoutAlias(userKey.publicKey)
      .setInitialBalance(USER_INITIAL_BALANCE)
      .execute(client)
  ).getReceipt(client);
  const userId = createReceipt.accountId;
  if (!userId) {
    console.error("Account creation returned no accountId");
    process.exit(1);
  }
  console.log("user        (owner)     :", userId.toString(), `(funded ${USER_INITIAL_BALANCE.toString()})`);

  // --- User grants the agent an HBAR allowance ------------------------------
  const approveTx = await new AccountAllowanceApproveTransaction()
    .approveHbarAllowance(userId, agentId, ALLOWANCE)
    .freezeWith(client)
    .sign(userKey); // the OWNER authorizes; facilitator remains fee payer + submitter
  const approveReceipt = await (await approveTx.execute(client)).getReceipt(client);
  console.log(`\nallowance approved: ${ALLOWANCE.toString()} -> status ${approveReceipt.status.toString()}\n`);

  // --- The three cases ------------------------------------------------------
  const cases: Case[] = [
    {
      name: "A  approved transfer, fee payer = FACILITATOR (third party)",
      feePayer: facilitatorId,
      amount: PAYMENT,
      expectation: "THE decisive case — x402 needs this to succeed",
    },
    {
      name: "B  approved transfer, fee payer = AGENT (the spender)",
      feePayer: agentId,
      amount: PAYMENT,
      expectation: "control: proves the allowance itself works",
    },
  ];

  const results: { name: string; status: string }[] = [];

  for (const testCase of cases) {
    console.log(`--- ${testCase.name}`);
    console.log(`    (${testCase.expectation})`);
    const status = await attempt({
      client,
      userId,
      payTo,
      amount: testCase.amount,
      feePayer: testCase.feePayer,
      agentKey,
    });
    results.push({ name: testCase.name, status });
    console.log(`    => ${status}\n`);
  }

  // --- Case C: does the allowance ceiling actually bite? --------------------
  // Only meaningful if some fee-payer arrangement worked above.
  const workingFeePayer =
    results[0].status === "SUCCESS" ? facilitatorId : results[1].status === "SUCCESS" ? agentId : null;
  if (workingFeePayer) {
    console.log("--- C  transfer EXCEEDING the remaining allowance");
    console.log("    (expect AMOUNT_EXCEEDS_ALLOWANCE — proves the on-chain ceiling is real)");
    const status = await attempt({
      client,
      userId,
      payTo,
      amount: new Hbar(2), // allowance was 1 HBAR, 0.1 already spent
      feePayer: workingFeePayer,
      agentKey,
    });
    results.push({ name: "C  over-allowance transfer", status });
    console.log(`    => ${status}\n`);
  } else {
    console.log("--- C skipped: neither fee-payer arrangement settled\n");
  }

  // --- Verdict --------------------------------------------------------------
  console.log("=".repeat(72));
  for (const r of results) console.log(`${r.status.padEnd(28)} ${r.name}`);
  console.log("=".repeat(72));

  const caseA = results[0].status;
  const caseB = results[1].status;

  if (caseA === "SUCCESS") {
    console.log("\nVERDICT: GO. An approved HBAR debit settles with the facilitator as fee payer.");
    console.log("The allowance design is compatible with x402 — proceed to Step 1.");
  } else if (caseB === "SUCCESS") {
    console.log("\nVERDICT: NO-GO for the x402 fee-payer model.");
    console.log("Allowances work, but ONLY when the spender is the fee payer — which x402 forbids");
    console.log("(the facilitator must own the transaction id). Fall back to the one-time deposit model,");
    console.log("or teach the facilitator to submit without being the transaction-id account.");
  } else {
    console.log("\nVERDICT: NO-GO. The allowance itself did not settle; see statuses above.");
    console.log("Do not proceed to Steps 2-4 — fall back to the one-time deposit model.");
  }

  client.close();
}

/**
 * Builds the payment exactly as the real allowance signer would: the user's account is
 * debited via an APPROVED transfer, the supplier is credited, the transaction id belongs
 * to `feePayer`, and only the AGENT signs. The user never signs.
 */
async function attempt(opts: {
  client: Client;
  userId: AccountId;
  payTo: AccountId;
  amount: Hbar;
  feePayer: AccountId;
  agentKey: PrivateKey;
}): Promise<string> {
  const { client, userId, payTo, amount, feePayer, agentKey } = opts;
  try {
    const tx = new TransferTransaction()
      .addApprovedHbarTransfer(userId, amount.negated())
      .addHbarTransfer(payTo, amount)
      .setTransactionId(TransactionId.generate(feePayer))
      .freezeWith(client);

    // Spender signature only — this is the whole point of the probe.
    const signed = await tx.sign(agentKey);

    // Round-trip through bytes to mirror what x402 actually transports (base64 over HTTP),
    // so a serialization quirk shows up here rather than in the app.
    const rehydrated = TransferTransaction.fromBytes(signed.toBytes());

    const receipt = await (await rehydrated.execute(client)).getReceipt(client);
    return receipt.status.toString();
  } catch (err) {
    // A precheck rejection surfaces as an error carrying a Status, not a receipt.
    const status = (err as { status?: Status })?.status;
    if (status) return `${status.toString()} (precheck)`;
    return `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
