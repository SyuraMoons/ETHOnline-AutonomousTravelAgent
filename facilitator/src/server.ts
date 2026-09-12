/**
 * Self-hosted x402 facilitator for Hedera.
 *
 * This is a thin HTTP wrapper around the official Hedera reference scheme
 * (`@x402/hedera/exact/facilitator`) and the generic facilitator engine
 * (`@x402/core/facilitator`). It exposes the three endpoints an x402 resource
 * server expects:
 *
 *   GET  /supported  -> advertised payment kinds + the account that must own the transaction id
 *   POST /verify     -> validate a signed payment payload against requirements
 *   POST /settle     -> co-sign, submit to Hedera, await a SUCCESS receipt
 *
 * It is non-custodial: it can only sign and submit a transfer the buyer already authorized,
 * never originate one.
 *
 * Note that the scheme's "feePayer" names the account owning the transaction id. In treasury
 * mode that is this facilitator, which then genuinely sponsors the fee. In allowance mode it
 * is the planner's agent account, and this service degrades to a verifying relay — see
 * ADVERTISED_FEE_PAYER below.
 */
import "dotenv/config";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { x402Facilitator } from "@x402/core/facilitator";
import type { Network, PaymentPayload, PaymentRequirements } from "@x402/core/types";
import {
  PrivateKey,
  createHederaClient,
  createHederaPreflightTransfer,
  createHederaSignAndSubmitTransaction,
  toFacilitatorHederaSigner,
} from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/facilitator";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    console.error(`[facilitator] missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

const PORT = Number(process.env.PORT ?? 4020);
const NETWORK = (process.env.X402_NETWORK ?? "hedera:testnet") as Network;
const FEE_PAYER_ID = requireEnv("FACILITATOR_ACCOUNT_ID");
const FEE_PAYER_KEY = PrivateKey.fromStringECDSA(requireEnv("FACILITATOR_PRIVATE_KEY"));
// Optional custom consensus node endpoint (useful for private Hedera networks).
const NODE_URL = process.env.HEDERA_NODE_URL || undefined;

/**
 * The account advertised to buyers as `extra.feePayer` — which in this scheme really means
 * "the account that owns the transaction id", not "the account that sponsors the fee".
 * The scheme requires them to be the same (`transactionIdAccountId !== feePayer` is rejected),
 * and Hedera requires the transaction-id account to be the SPENDER for approved transfers.
 *
 * Two mutually exclusive modes, because only one account can be advertised at a time
 * (the scheme picks at random when several are listed):
 *
 *   ALLOWANCE MODE (default) — set this to the planner's AGENT_ACCOUNT_ID. The agent owns the
 *     transaction id and pays the node fee; the debit is an approved transfer from the USER's
 *     account under a HIP-336 allowance. The facilitator verifies and submits, and its own
 *     signature is superfluous (verified on testnet: allowance-probe-d.ts, cases D1 and D2).
 *
 *   TREASURY MODE — leave unset. The facilitator sponsors fees and the agent pays from its own
 *     balance, the original behaviour. Incompatible with allowance mode on one instance: the
 *     agent would be both fee payer and debited account, which the scheme rejects.
 *
 * Testnet evidence for why this knob must exist at all: with the FACILITATOR as the
 * transaction-id account, an approved transfer fails precheck with
 * SPENDER_DOES_NOT_HAVE_ALLOWANCE (allowance-probe.ts, case A).
 */
const ADVERTISED_FEE_PAYER = process.env.FACILITATOR_ADVERTISED_FEE_PAYER?.trim() || FEE_PAYER_ID;

/**
 * Builds an SDK client for a CAIP-2 network with the fee-payer set as operator,
 * so it can pay fees and submit transactions.
 */
function buildClient(network: string) {
  const client = createHederaClient(network, NODE_URL);
  client.setOperator(FEE_PAYER_ID, FEE_PAYER_KEY);
  return client;
}

const signer = toFacilitatorHederaSigner({
  // Advertised to buyers and re-checked at settle; see ADVERTISED_FEE_PAYER above.
  // Exactly one entry — the scheme picks at random from this list.
  getAddresses: () => [ADVERTISED_FEE_PAYER],
  signAndSubmitTransaction: createHederaSignAndSubmitTransaction(buildClient, FEE_PAYER_KEY),
  preflightTransfer: createHederaPreflightTransfer(buildClient),
});

// `aliasPolicy: "reject"` mirrors the reference default: payTo must be a concrete
// account id (e.g. 0.0.1234), not an EVM alias that would trigger fee-payer-funded
// auto-account-creation.
const facilitator = new x402Facilitator().register(NETWORK, new ExactHederaScheme(signer, { aliasPolicy: "reject" }));

function sendJson(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<{ x402Version: number; paymentPayload: PaymentPayload; paymentRequirements: PaymentRequirements }> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : ({} as never);
}

const server = createServer(async (req, res) => {
  const { method } = req;
  const path = (req.url ?? "/").split("?")[0];

  try {
    if (method === "GET" && (path === "/health" || path === "/")) {
      return sendJson(res, 200, {
        status: "ok",
        network: NETWORK,
        feePayer: ADVERTISED_FEE_PAYER,
        submitter: FEE_PAYER_ID,
        mode: ADVERTISED_FEE_PAYER === FEE_PAYER_ID ? "treasury" : "allowance",
      });
    }

    if (method === "GET" && path === "/supported") {
      return sendJson(res, 200, facilitator.getSupported());
    }

    if (method === "POST" && path === "/verify") {
      const { paymentPayload, paymentRequirements } = await readJson(req);
      const result = await facilitator.verify(paymentPayload, paymentRequirements);
      return sendJson(res, 200, result);
    }

    if (method === "POST" && path === "/settle") {
      const { paymentPayload, paymentRequirements } = await readJson(req);
      const result = await facilitator.settle(paymentPayload, paymentRequirements);
      return sendJson(res, 200, result);
    }

    return sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`[facilitator] ${method} ${path} failed:`, message);
    return sendJson(res, 500, { error: "facilitator_error", message });
  }
});

server.listen(PORT, () => {
  const mode = ADVERTISED_FEE_PAYER === FEE_PAYER_ID ? "treasury" : "allowance";
  console.log(`[facilitator] x402 Hedera facilitator listening on :${PORT}`);
  console.log(`[facilitator] network=${NETWORK} submitter=${FEE_PAYER_ID}`);
  console.log(`[facilitator] mode=${mode} advertisedFeePayer=${ADVERTISED_FEE_PAYER}`);
});
