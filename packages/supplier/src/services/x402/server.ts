import type { HTTPRequestContext } from "@x402/core/http";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import type { Request as ExpressRequest } from "express";

/**
 * x402 resource-server wiring for the supplier — same pattern as
 * packages/nextjs/services/x402/server.ts, pointed at the same self-hosted
 * facilitator (facilitator/, docker-compose.yml). Deliberately duplicated
 * rather than shared: Express doesn't hand you a Fetch `Request` the way
 * Next.js route handlers do, so the adapter below is Express-specific.
 * This process never holds FACILITATOR_PRIVATE_KEY.
 *
 * TODO Phase 1: wire getResourceServer()/makeExpressHttpContext() into the
 * flights/booking route handlers to build real PaymentRequirements and call
 * verify()/settle() instead of the fixed stub challenge bodies they use now.
 */

export const X402_NETWORK = (process.env.X402_NETWORK ?? "hedera:testnet") as Network;
export const FACILITATOR_URL = process.env.FACILITATOR_URL ?? "http://localhost:4020";
export const HBAR_ASSET = "0.0.0";
export const MAX_TIMEOUT_SECONDS = 180;

let serverPromise: Promise<x402ResourceServer> | null = null;

export function getResourceServer(): Promise<x402ResourceServer> {
  if (!serverPromise) {
    serverPromise = (async () => {
      const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
      const server = new x402ResourceServer(facilitator).register(X402_NETWORK, new ExactHederaScheme());
      await server.initialize();
      return server;
    })().catch(error => {
      serverPromise = null;
      throw error;
    });
  }
  return serverPromise;
}

export function makeExpressHttpContext(req: ExpressRequest): { context: HTTPRequestContext; resourceUrl: string } {
  const protocol = req.protocol;
  const host = req.get("host") ?? "localhost";
  const resourceUrl = `${protocol}://${host}${req.path}`;

  const context: HTTPRequestContext = {
    adapter: {
      getHeader: name => req.get(name) ?? undefined,
      getMethod: () => req.method,
      getPath: () => req.path,
      getUrl: () => `${protocol}://${host}${req.originalUrl}`,
      getAcceptHeader: () => req.get("accept") ?? "",
      getUserAgent: () => req.get("user-agent") ?? "",
      getQueryParam: name => {
        const value = req.query[name];
        return typeof value === "string" ? value : undefined;
      },
    },
    path: req.path,
    method: req.method,
    paymentHeader: req.get("payment-signature") ?? req.get("x-payment") ?? undefined,
  };

  return { context, resourceUrl };
}
