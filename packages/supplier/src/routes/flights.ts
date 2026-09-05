import { Router } from "express";
import type { X402Challenge } from "@sh/contracts";
import { HBAR_ASSET, X402_NETWORK } from "../services/x402/server.js";

export const flightsRouter = Router();

// Pricing: clamp(resultCount * SEARCH_PRICE_PER_RESULT_HBAR, SEARCH_PRICE_MIN_HBAR, SEARCH_PRICE_MAX_HBAR).
// Quote-token cache: QUOTE_TTL_UNPAID_SECONDS (300s) before payment,
// QUOTE_TTL_PAID_SECONDS (900s) after — neither enforced yet.
//
// TODO Phase 1: use services/x402/server.ts (getResourceServer + makeExpressHttpContext)
// to build a real PaymentRequirements/verify/settle flow, then serve matching rows
// from lib/flightsCache.ts on success instead of always challenging.
flightsRouter.get("/v1/flights/search", (_req, res) => {
  const challenge: X402Challenge = {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: X402_NETWORK,
        maxAmountRequired: "0",
        resource: "/v1/flights/search",
        description: "not_implemented — priced at clamp(resultCount * 0.05, 0.10, 2.50) HBAR",
        mimeType: "application/json",
        payTo: "not_implemented",
        asset: HBAR_ASSET,
      },
    ],
  };
  res.status(402).json(challenge);
});
