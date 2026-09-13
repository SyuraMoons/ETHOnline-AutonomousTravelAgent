import { PrivateKey } from "@hiero-ledger/sdk";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { Network, PaymentRequired, SettleResponse } from "@x402/core/types";
import { createClientHederaSigner } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import { createAllowanceHederaSigner } from "~~/services/x402/allowanceSigner";

/**
 * Server-side x402 buyer — the agent's own machine-to-machine payment path,
 * lifted from `scripts/x402-buy.ts` (verified against a real Hedera testnet
 * settlement). Used by /api/plan to pay packages/supplier directly with a
 * server-held key, never the browser wallet.
 *
 * Split into quote() + pay() rather than one atomic call: the caller must
 * check the mandate against the REAL quoted amount before any HBAR moves —
 * a single payAndFetch that pays first and reports the amount after would
 * let an over-ceiling payment settle before the mandate ever sees it.
 */

export type Quote = {
  paymentRequired: PaymentRequired;
  amountTinybars: bigint;
  baseInit: RequestInit;
  /**
   * Carried from quote() to pay() so the two can never disagree about whose money this is.
   * Passing it separately to pay() would make "quoted against the user, paid from the
   * treasury" a silent one-argument mistake.
   */
  payFrom: PayFrom;
};

export type PaidResult<T> = {
  body: T;
  transaction: string;
  /** The debited account — the user's own account in allowance mode, the agent's in treasury
   * mode. NOT the recipient; do not use this as a "paid to" value. */
  payer: string;
  /** The recipient named in the 402 challenge itself (`accepts[0].payTo`) — the supplier's
   * PAY_TO, straight from the payment requirements this payment was actually made against. */
  payTo: string;
  amountTinybars: bigint;
};

export class SupplierUnreachableError extends Error {}
export class PaymentFailedError extends Error {}

const FETCH_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 750;

/**
 * fetch() with a timeout and one retry, for the Hedera-testnet supplier hop specifically —
 * a single transient DNS/connect blip between two Railway services otherwise fails the whole
 * request immediately, with no second chance. Only retries a network-level failure (a rejected
 * fetch); an HTTP error response is a real answer from the server and is returned as-is.
 */
export async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      lastErr = err;
      if (attempt === 0) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function agentCredentials(): { accountId: string; privateKey: string; network: Network } {
  const accountId = process.env.AGENT_ACCOUNT_ID;
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!accountId || !privateKey) {
    throw new PaymentFailedError("AGENT_ACCOUNT_ID / AGENT_PRIVATE_KEY are not configured");
  }
  const network = (process.env.X402_NETWORK ?? "hedera:testnet") as Network;
  return { accountId, privateKey, network };
}

/**
 * The account whose HBAR funds a payment.
 *
 * Omitted — TREASURY: the agent pays from its own balance (the original behaviour).
 * Set — ALLOWANCE: the agent spends from this user's account under a HIP-336 allowance,
 * so the user is the on-chain payer and never signs. See allowanceSigner.ts.
 */
export type PayFrom = string | undefined;

function buildHttpClient(payFrom: PayFrom) {
  const { accountId, privateKey: privateKeyStr, network } = agentCredentials();
  const privateKey = PrivateKey.fromStringECDSA(privateKeyStr);
  const signer = payFrom
    ? createAllowanceHederaSigner({
        ownerAccountId: payFrom,
        spenderAccountId: accountId,
        spenderPrivateKey: privateKey,
      })
    : createClientHederaSigner(accountId, privateKey, { network });
  // Native HBAR ("0.0.0") isn't in @x402/core's recognized-default-asset list,
  // so the client's spend-control guard rejects every Hedera payment unless
  // controls are disabled — this is a server-held agent key under a mandate,
  // not an unattended browser wallet, so the mandate is the real ceiling.
  const client = new x402Client().register(network, new ExactHederaScheme(signer)).setSpendControls(false);
  return new x402HTTPClient(client);
}

/**
 * Requests a 402-gated resource unpaid to learn its real price. Does not
 * spend anything. Throws SupplierUnreachableError on network failure.
 */
export async function quote(opts: {
  url: string;
  method?: "GET" | "POST";
  body?: unknown;
  payFrom?: PayFrom;
}): Promise<Quote> {
  const httpClient = buildHttpClient(opts.payFrom);
  const method = opts.method ?? "GET";
  const baseInit: RequestInit = {
    method,
    headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  };

  let first: Response;
  try {
    first = await fetchWithRetry(opts.url, baseInit);
  } catch (err) {
    throw new SupplierUnreachableError(err instanceof Error ? err.message : "fetch failed");
  }

  if (first.ok) {
    throw new PaymentFailedError("Resource did not require payment — expected a 402 challenge");
  }
  if (first.status !== 402) {
    const text = await first.text().catch(() => "");
    throw new PaymentFailedError(`Unexpected status ${first.status}: ${text}`);
  }

  const challengeBody = await first
    .clone()
    .json()
    .catch(() => undefined);
  const paymentRequired = httpClient.getPaymentRequiredResponse(name => first.headers.get(name), challengeBody);
  const amountTinybars = BigInt(paymentRequired.accepts[0]?.amount ?? "0");

  return { paymentRequired, amountTinybars, baseInit, payFrom: opts.payFrom };
}

/**
 * Signs and settles payment for a previously-quoted resource, then returns
 * the paid response body. Only call this after the mandate has cleared the
 * quoted amount.
 */
export async function pay<T = unknown>(opts: { url: string; quote: Quote }): Promise<PaidResult<T>> {
  const httpClient = buildHttpClient(opts.quote.payFrom);
  const payload = await httpClient.createPaymentPayload(opts.quote.paymentRequired);
  const paymentHeaders = httpClient.encodePaymentSignatureHeader(payload);

  let paid: Response;
  try {
    paid = await fetchWithRetry(opts.url, {
      ...opts.quote.baseInit,
      headers: { ...opts.quote.baseInit.headers, ...paymentHeaders },
    });
  } catch (err) {
    throw new SupplierUnreachableError(err instanceof Error ? err.message : "fetch failed");
  }
  const result = await httpClient.processResponse(paid);

  if (result.paymentStatus !== "settled") {
    const reason =
      result.paymentStatus === "settle_failed" || result.paymentStatus === "payment_required"
        ? ((result.header as { error?: string } | undefined)?.error ?? result.paymentStatus)
        : result.paymentStatus;
    throw new PaymentFailedError(`Payment failed: ${reason}`);
  }

  const settlement = result.header as SettleResponse;
  return {
    body: result.body as T,
    transaction: settlement.transaction,
    payer: settlement.payer ?? "",
    payTo: opts.quote.paymentRequired.accepts[0]?.payTo ?? "",
    amountTinybars: opts.quote.amountTinybars,
  };
}
