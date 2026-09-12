import "dotenv/config";
import { clampTinybar, hbarToTinybar } from "./lib/tinybar.js";

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
export const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`;

export const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "http://localhost:4020";
export const X402_NETWORK = process.env.X402_NETWORK ?? "hedera:testnet";
export const HBAR_ASSET = "0.0.0";
export const MAX_TIMEOUT_SECONDS = 180;

// Seller's Hedera account id — where buyer payments land. No key needed here;
// the buyer's wallet/agent key and the facilitator's fee-payer key are the
// only private keys involved in an x402 payment.
export const PAY_TO = requireEnv("PAY_TO");

// Ed25519 private key (base64 PKCS8) the supplier signs booking confirmations
// with. Generate one with `npm run supplier:gen-signing-key`.
export const SUPPLIER_SIGNING_KEY = requireEnv("SUPPLIER_SIGNING_KEY");

const SEARCH_PRICE_PER_RESULT_HBAR = process.env.SEARCH_PRICE_PER_RESULT_HBAR ?? "0.05";
const SEARCH_PRICE_MIN_HBAR = process.env.SEARCH_PRICE_MIN_HBAR ?? "0.10";
const SEARCH_PRICE_MAX_HBAR = process.env.SEARCH_PRICE_MAX_HBAR ?? "2.50";
const BOOKING_FEE_HBAR = process.env.BOOKING_FEE_HBAR ?? "1.00";

export const QUOTE_TTL_UNPAID_SECONDS = process.env.QUOTE_TTL_UNPAID_SECONDS
  ? Number(process.env.QUOTE_TTL_UNPAID_SECONDS)
  : 300;
export const QUOTE_TTL_PAID_SECONDS = process.env.QUOTE_TTL_PAID_SECONDS
  ? Number(process.env.QUOTE_TTL_PAID_SECONDS)
  : 900;

/** clamp(resultCount * SEARCH_PRICE_PER_RESULT_HBAR, MIN, MAX), in tinybars. */
export function searchPriceTinybars(resultCount: number): bigint {
  const perResult = hbarToTinybar(SEARCH_PRICE_PER_RESULT_HBAR);
  const raw = perResult * BigInt(Math.max(resultCount, 0));
  return clampTinybar(raw, SEARCH_PRICE_MIN_HBAR, SEARCH_PRICE_MAX_HBAR);
}

/** Flat booking fee, in tinybars. */
export function bookingFeeTinybars(): bigint {
  return hbarToTinybar(BOOKING_FEE_HBAR);
}

export const searchPricingLabel = `clamp(count x ${SEARCH_PRICE_PER_RESULT_HBAR}, ${SEARCH_PRICE_MIN_HBAR}, ${SEARCH_PRICE_MAX_HBAR}) HBAR`;
export const bookingPricingLabel = `flat ${BOOKING_FEE_HBAR} HBAR`;
