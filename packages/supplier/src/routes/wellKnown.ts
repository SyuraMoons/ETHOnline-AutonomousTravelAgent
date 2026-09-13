import { Router } from "express";
import type { AgentCard } from "@sh/contracts";
import {
  PAY_TO,
  PUBLIC_BASE_URL,
  X402_NETWORK,
  bookingPricingLabel,
  pricingLabel,
} from "../config.js";
import { supplierPublicKeyBase64 } from "../lib/signing.js";

export const wellKnownRouter = Router();

wellKnownRouter.get("/.well-known/x402", (_req, res) => {
  const agentCard: AgentCard = {
    agentId: "meridian-flight-data",
    name: "Meridian Flight Data",
    description:
      "x402-gated travel data on Hedera testnet: flights, stays and activities, metered per result.",
    payTo: PAY_TO,
    bookingPublicKey: supplierPublicKeyBase64,
    services: [
      {
        id: "flight-search",
        name: "Flight Search",
        description:
          "Search cached flight inventory for a route, metered per result.",
        endpoint: `${PUBLIC_BASE_URL}/v1/flights/search`,
        method: "GET",
        network: X402_NETWORK,
        pricing: pricingLabel("flights"),
      },
      {
        id: "stay-search",
        name: "Stay Search",
        description:
          "Search cached accommodation for a city and date range, priced for the whole stay, metered per property.",
        endpoint: `${PUBLIC_BASE_URL}/v1/stays/search`,
        method: "GET",
        network: X402_NETWORK,
        pricing: pricingLabel("stays"),
      },
      {
        id: "activity-search",
        name: "Activity Search",
        description:
          "Search bookable experiences for a city and date, metered per start time.",
        endpoint: `${PUBLIC_BASE_URL}/v1/activities/search`,
        method: "GET",
        network: X402_NETWORK,
        pricing: pricingLabel("activities"),
      },
      {
        id: "flight-booking",
        name: "Flight Booking",
        description:
          "Book a whole itinerary. The fare is charged to the buyer's card; this call costs no HBAR. Returns a simulated confirmation, never a real reservation.",
        endpoint: `${PUBLIC_BASE_URL}/v1/booking`,
        method: "POST",
        network: X402_NETWORK,
        pricing: bookingPricingLabel,
      },
    ],
  };
  res.json(agentCard);
});
