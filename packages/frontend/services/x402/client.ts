import type { ClientHederaSigner } from "@x402/hedera";

/**
 * Browser-side x402 payment client.
 *
 * Uses the HashPack WalletConnect session via UniversalProvider for native Hedera signing.
 * For machine-to-machine use, see `npm run x402:buy`.
 *
 * Heavy dependencies are loaded with dynamic `import()` when a user actually pays.
 */

/** CAIP-2 network the client signs for; must match the resource server. */
export const X402_CLIENT_NETWORK = process.env.NEXT_PUBLIC_X402_NETWORK ?? "hedera:testnet";

/** Outcome of a paid request. */
export type PaidFetchResult<T = unknown> = {
  body: T;
  transaction?: string;
  payer?: string;
};

async function buildHttpClient(signer: ClientHederaSigner) {
  const [clientScheme, core] = await Promise.all([import("@x402/hedera/exact/client"), import("@x402/core/client")]);
  const scheme = new clientScheme.ExactHederaScheme(signer);
  const x402Client = new core.x402Client().register(X402_CLIENT_NETWORK as never, scheme);
  return new core.x402HTTPClient(x402Client);
}

async function buildWalletSigner(hederaAccountId: string): Promise<ClientHederaSigner> {
  const [{ getHederaProvider }, { createHederaProviderSigner }] = await Promise.all([
    import("~~/services/web3/appKitHedera"),
    import("~~/services/x402/walletSigner"),
  ]);

  const provider = await getHederaProvider();
  return createHederaProviderSigner(hederaAccountId, provider, { network: X402_CLIENT_NETWORK });
}

/**
 * Pay for and fetch a 402-gated resource.
 *
 * Implements the x402 retry loop: request the resource, read the `402`
 * challenge, sign the HBAR transfer, retry with the `PAYMENT-SIGNATURE` header,
 * and return the parsed response body once settlement succeeds.
 */
export async function payAndFetch<T = unknown>(params: {
  resourceUrl: string;
  hederaAccountId: string;
}): Promise<PaidFetchResult<T>> {
  if (!params.hederaAccountId) {
    throw new Error("Connect HashPack to pay in-browser.");
  }

  const signer = await buildWalletSigner(params.hederaAccountId);
  const httpClient = await buildHttpClient(signer);

  const first = await fetch(params.resourceUrl);
  if (first.ok) {
    const body = (await first.json()) as T;
    return { body };
  }
  if (first.status !== 402) {
    const body = await first.json().catch(() => ({}) as { error?: string });
    throw new Error(body?.error ?? `Request failed with status ${first.status}`);
  }

  const challengeBody = await first
    .clone()
    .json()
    .catch(() => undefined);
  const paymentRequired = httpClient.getPaymentRequiredResponse(name => first.headers.get(name), challengeBody);
  const payload = await httpClient.createPaymentPayload(paymentRequired);
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(payload);

  const paid = await fetch(params.resourceUrl, { headers: paymentHeaders });
  const result = await httpClient.processResponse(paid);

  switch (result.kind) {
    case "success": {
      return {
        body: result.body as T,
        transaction: result.settleResponse.transaction,
        payer: result.settleResponse.payer,
      };
    }
    case "settle_failed":
      throw new Error(`Payment settlement failed: ${result.settleResponse.errorReason ?? "unknown"}`);
    case "payment_required": {
      const reason = (result.paymentRequired as { error?: string })?.error ?? "Payment was rejected by the server";
      throw new Error(reason);
    }
    case "error": {
      const body = result.body as { error?: string };
      throw new Error(body?.error ?? `Request failed with status ${result.status}`);
    }
    default:
      throw new Error("Unexpected response from server");
  }
}
