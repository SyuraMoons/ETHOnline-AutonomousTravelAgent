/**
 * x402 agent buyer — pays for a 402-gated resource from the command line.
 *
 * This is the machine-to-machine counterpart to the in-app wallet flow:
 * it signs the HBAR transfer with a real Hedera key, so it works for any funded
 * account and is the canonical "agent pays per use" demonstration.
 *
 * This reference script expects the resource to respond with `{ url }` on success
 * (as a file-download endpoint would) — adapt the response handling below to match
 * whatever resource you point it at.
 *
 * Usage:
 *   RESOURCE_URL="http://localhost:3000/api/<your-402-gated-route>" \
 *   BUYER_ACCOUNT_ID=0.0.xxxx \
 *   BUYER_PRIVATE_KEY=0x... \
 *   [X402_NETWORK=hedera:testnet] [OUTPUT=./downloaded.bin] \
 *   npm run x402:buy
 */
import { PrivateKey } from "@hiero-ledger/sdk";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { Network } from "@x402/core/types";
import { createClientHederaSigner } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { writeFile } from "node:fs/promises";

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
  const output = process.env.OUTPUT ?? "./downloaded.bin";

  const privateKey = PrivateKey.fromStringECDSA(privateKeyStr);
  const signer = createClientHederaSigner(accountId, privateKey, { network });
  const client = new x402Client().register(network, new ExactHederaScheme(signer));
  const httpClient = new x402HTTPClient(client);

  console.log(`[x402-buy] GET ${resourceUrl}`);
  const first = await fetch(resourceUrl);

  let downloadUrl: string;

  if (first.ok) {
    const body = (await first.json()) as { url?: string };
    if (!body.url) throw new Error("Server returned no download URL");
    console.log("[x402-buy] File is public — no payment required.");
    downloadUrl = body.url;
  } else if (first.status === 402) {
    console.log("[x402-buy] 402 Payment Required — building and signing payment…");
    const challengeBody = await first
      .clone()
      .json()
      .catch(() => undefined);
    const paymentRequired = httpClient.getPaymentRequiredResponse(name => first.headers.get(name), challengeBody);
    const payload = await httpClient.createPaymentPayload(paymentRequired);
    const headers = httpClient.encodePaymentSignatureHeader(payload);

    console.log("[x402-buy] Retrying with PAYMENT-SIGNATURE…");
    const paid = await fetch(resourceUrl, { headers });
    const result = await httpClient.processResponse(paid);

    if (result.kind !== "success") {
      throw new Error(`Payment failed: ${result.kind}`);
    }
    const body = result.body as { url?: string };
    if (!body.url) throw new Error("Payment succeeded but no download URL was returned");
    console.log(`[x402-buy] Settled · tx ${result.settleResponse.transaction}`);
    downloadUrl = body.url;
  } else {
    const body = await first.text();
    throw new Error(`Unexpected status ${first.status}: ${body}`);
  }

  console.log("[x402-buy] Downloading file…");
  const fileRes = await fetch(downloadUrl);
  if (!fileRes.ok) throw new Error(`Download failed with status ${fileRes.status}`);
  const bytes = Buffer.from(await fileRes.arrayBuffer());
  await writeFile(output, bytes);
  console.log(`[x402-buy] Saved ${bytes.length} bytes to ${output}`);
}

main().catch(error => {
  console.error("[x402-buy]", error instanceof Error ? error.message : error);
  process.exit(1);
});
