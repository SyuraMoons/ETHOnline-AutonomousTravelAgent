import { Router } from "express";
import type { AgentCard } from "@sh/contracts";
import { PAY_TO, PUBLIC_BASE_URL, X402_NETWORK, bookingPricingLabel, searchPricingLabel } from "../config.js";
import { supplierPublicKeyBase64 } from "../lib/signing.js";

export const wellKnownRouter = Router();

wellKnownRouter.get("/.well-known/x402", (_req, res) => {
  const agentCard: AgentCard = {
    agentId: "meridian-flight-data",
    name: "Meridian Flight Data",
    description: "x402-gated flight search and booking service on Hedera testnet.",
    payTo: PAY_TO,
    bookingPublicKey: supplierPublicKeyBase64,
    services: [
      {
        id: "flight-search",
        name: "Flight Search",
        description: "Search cached flight inventory for a route, metered per result.",
        endpoint: `${PUBLIC_BASE_URL}/v1/flights/search`,
        method: "GET",
        network: X402_NETWORK,
        pricing: searchPricingLabel,
      },
      {
        id: "flight-booking",
        name: "Flight Booking",
        description: "Book a searched offer. Returns a simulated confirmation, never a real reservation.",
        endpoint: `${PUBLIC_BASE_URL}/v1/booking`,
        method: "POST",
        network: X402_NETWORK,
        pricing: bookingPricingLabel,
      },
    ],
  };
  res.json(agentCard);
});
