import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `[supplier] Missing required env var ${name}. See packages/supplier/.env.example — ` +
        `the supplier cannot accept payment or sign bookings without it.`,
    );
  }
  return value;
}

export const PORT = process.env.PORT ? Number(process.env.PORT) : 4100;
export const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`;

export const FACILITATOR_URL =
  process.env.FACILITATOR_URL ?? "http://localhost:4020";
export const X402_NETWORK = process.env.X402_NETWORK ?? "hedera:testnet";
export const HBAR_ASSET = "0.0.0";
export const MAX_TIMEOUT_SECONDS = 180;

/**
 * How long to wait for a facilitator verify/settle before giving up.
 *
 * The library default of 30s is not enough for settle on testnet: the transfer
 * reaches consensus but the reply lands later, so a completed payment is read
 * as a failure and a retry charges the buyer a second time.
 */
export const FACILITATOR_TIMEOUT_MS = process.env["FACILITATOR_TIMEOUT_MS"]
  ? Number(process.env["FACILITATOR_TIMEOUT_MS"])
  : 120_000;

// Seller's Hedera account id — where buyer payments land. No key needed here;
// the buyer's wallet/agent key and the facilitator's fee-payer key are the
// only private keys involved in an x402 payment.
export const PAY_TO = requireEnv("PAY_TO");

// Ed25519 private key (base64 PKCS8) the supplier signs booking confirmations
// with. Generate one with `npm run supplier:gen-signing-key`.
export const SUPPLIER_SIGNING_KEY = requireEnv("SUPPLIER_SIGNING_KEY");

// Pricing lives in lib/pricing.ts so it can be imported (and tested) without
// the payment credentials this module hard-requires. Re-exported here so
// callers still have one place to look.
export {
  QUOTE_TTL_UNPAID_SECONDS,
  QUOTE_TTL_PAID_SECONDS,
  PRICE_BANDS,
  priceTinybars,
  pricingLabel,
  bookingPricingLabel,
  type PriceBand,
  type PriceBandName,
} from "./lib/pricing.js";

import { pricingLabel as label } from "./lib/pricing.js";

/** Flight-band shorthand, kept so the reference route reads unchanged. */
export function searchPriceTinybars(resultCount: number): bigint {
  return priceTinybarsImpl("flights", resultCount);
}
import { priceTinybars as priceTinybarsImpl } from "./lib/pricing.js";

export const searchPricingLabel = label("flights");
