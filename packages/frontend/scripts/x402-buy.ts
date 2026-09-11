/**
 * x402 agent buyer — pays for a 402-gated resource from the command line.
 *
 * This is the machine-to-machine counterpart to the in-app wallet flow:
 * it signs the HBAR transfer with a real Hedera key, so it works for any funded
 * account and is the canonical "agent pays per use" demonstration. Prints the
 * parsed JSON response body — pipe to `jq` or redirect to a file as needed.
 *
 * Usage:
 *   RESOURCE_URL="http://localhost:4100/v1/flights/search?origin=SIN&destination=NRT&departDate=2026-10-12" \
 *   BUYER_ACCOUNT_ID=0.0.xxxx \
 *   BUYER_PRIVATE_KEY=0x... \
 *   [X402_NETWORK=hedera:testnet] \
 *   npm run x402:buy
 *
 * For a POST route (e.g. booking):
 *   METHOD=POST BODY='{"offerId":"flt_001","passengerName":"...","passengerEmail":"..."}' \
 *   RESOURCE_URL="http://localhost:4100/v1/booking" ... npm run x402:buy
 */
import { PrivateKey } from "@hiero-ledger/sdk";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { Network, SettleResponse } from "@x402/core/types";
import { createClientHederaSigner } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const resourceUrl = requireEnv("RESOURCE_URL");
  const accountId = requireEnv("BUYER_ACCOUNT_ID");
  const privateKeyStr = requireEnv("BUYER_PRIVATE_KEY");
  const network = (process.env.X402_NETWORK ?? "hedera:testnet") as Network;
  const method = (process.env.METHOD ?? "GET").toUpperCase();
  const body = process.env.BODY;

  const privateKey = PrivateKey.fromStringECDSA(privateKeyStr);
  const signer = createClientHederaSigner(accountId, privateKey, { network });
  // Native HBAR ("0.0.0") isn't in @x402/core's built-in recognized-default-asset
  // list, so the client's spend-control guard rejects every Hedera payment
  // unless controls are disabled — this is a CLI/agent buyer with an explicit
  // env-provided key, not an unattended browser wallet, so there is no
  // meaningful cap to enforce here.
  const client = new x402Client().register(network, new ExactHederaScheme(signer)).setSpendControls(false);
  const httpClient = new x402HTTPClient(client);

  const baseInit: RequestInit = {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body,
  };

  console.log(`[x402-buy] ${method} ${resourceUrl}`);
  const first = await fetch(resourceUrl, baseInit);

  let responseBody: unknown;

  if (first.ok) {
    responseBody = await first.json();
    console.log("[x402-buy] Resource is public — no payment required.");
  } else if (first.status === 402) {
    console.log("[x402-buy] 402 Payment Required — building and signing payment…");
    const challengeBody = await first
      .clone()
      .json()
      .catch(() => undefined);
    const paymentRequired = httpClient.getPaymentRequiredResponse(name => first.headers.get(name), challengeBody);
    const payload = await httpClient.createPaymentPayload(paymentRequired);
    const paymentHeaders = httpClient.encodePaymentSignatureHeader(payload);

    console.log("[x402-buy] Retrying with PAYMENT-SIGNATURE…");
    const paid = await fetch(resourceUrl, { ...baseInit, headers: { ...baseInit.headers, ...paymentHeaders } });
    const result = await httpClient.processResponse(paid);

    if (result.paymentStatus !== "settled") {
      const reason =
        result.paymentStatus === "settle_failed" || result.paymentStatus === "payment_required"
          ? ((result.header as { error?: string } | undefined)?.error ?? result.paymentStatus)
          : result.paymentStatus;
      throw new Error(`Payment failed: ${reason}`);
    }
    const settlement = result.header as SettleResponse;
    console.log(`[x402-buy] Settled · tx ${settlement.transaction} · payer ${settlement.payer}`);
    responseBody = result.body;
  } else {
    const text = await first.text();
    throw new Error(`Unexpected status ${first.status}: ${text}`);
  }

  console.log(JSON.stringify(responseBody, null, 2));
}

main().catch(error => {
  console.error("[x402-buy]", error instanceof Error ? error.message : error);
  process.exit(1);
});
