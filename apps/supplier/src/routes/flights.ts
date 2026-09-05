import { Router } from "express";
import type { X402Challenge } from "@autovoyage/contracts";

export const flightsRouter = Router();

// TODO Phase 1: build this from X402_PAY_TO / X402_UNIT_PRICE_HBAR env vars,
// verify payment via the Blocky402 facilitator (X402_FACILITATOR_URL), then
// serve matching rows from lib/flightsCache.ts instead of always challenging.
const stubChallenge: X402Challenge = {
  x402Version: 1,
  accepts: [
    {
      scheme: "exact",
      network: "hedera-testnet",
      maxAmountRequired: "0",
      resource: "/v1/flights/search",
      description: "not_implemented",
      mimeType: "application/json",
      payTo: "not_implemented",
      asset: "HBAR",
    },
  ],
};

flightsRouter.get("/v1/flights/search", (_req, res) => {
  res.status(402).json(stubChallenge);
});
