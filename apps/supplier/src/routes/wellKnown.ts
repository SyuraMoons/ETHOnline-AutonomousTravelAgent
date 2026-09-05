import { Router } from "express";
import type { AgentCard } from "@autovoyage/contracts";

export const wellKnownRouter = Router();

// TODO Phase 1: replace hardcoded values with env-driven config (pay-to account,
// live pricing) and keep this in sync with the ServiceRegistered HCS message
// published by scripts/register-service.ts.
const agentCard: AgentCard = {
  agentId: "autovoyage-flight-supplier",
  name: "AutoVoyage Flight Supplier",
  description: "x402-gated flight search and booking service on Hedera testnet.",
  services: [
    {
      id: "flight-search",
      name: "Flight Search",
      description: "Search cached flight inventory for a route.",
      endpoint: "/v1/flights/search",
      method: "GET",
      priceHbar: 0,
      network: "hedera-testnet",
    },
  ],
};

wellKnownRouter.get("/.well-known/x402", (_req, res) => {
  res.json(agentCard);
});
