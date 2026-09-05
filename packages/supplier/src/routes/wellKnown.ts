import { Router } from "express";
import type { AgentCard } from "@sh/contracts";

export const wellKnownRouter = Router();

// TODO Phase 1: source payTo from a funded Hedera account env var and keep
// this in sync with the ServiceRegistered HCS message (scripts/register-service.ts).
const agentCard: AgentCard = {
  agentId: "meridian-flight-data",
  name: "Meridian Flight Data",
  description: "x402-gated flight search and booking service on Hedera testnet.",
  payTo: "0.0.xxxxxx",
  services: [
    {
      id: "flight-search",
      name: "Flight Search",
      description: "Search cached flight inventory for a route, metered per result.",
      endpoint: "/v1/flights/search",
      method: "GET",
      network: "hedera:testnet",
    },
    {
      id: "flight-booking",
      name: "Flight Booking",
      description: "Book a searched offer. Returns a simulated confirmation, never a real reservation.",
      endpoint: "/v1/booking",
      method: "POST",
      network: "hedera:testnet",
    },
  ],
};

wellKnownRouter.get("/.well-known/x402", (_req, res) => {
  res.json(agentCard);
});
