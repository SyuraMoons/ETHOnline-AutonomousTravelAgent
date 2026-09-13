import { Router } from "express";
import { FACILITATOR_URL, PAY_TO, X402_NETWORK } from "../config.js";
import { cachedInventoryCount } from "../lib/inventory.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  let facilitatorReachable = false;
  try {
    const response = await fetch(`${FACILITATOR_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    facilitatorReachable = response.ok;
  } catch {
    facilitatorReachable = false;
  }

  res.json({
    ok: facilitatorReachable,
    payTo: PAY_TO,
    network: X402_NETWORK,
    facilitatorUrl: FACILITATOR_URL,
    facilitatorReachable,
    inventoryRows: cachedInventoryCount(),
  });
});
