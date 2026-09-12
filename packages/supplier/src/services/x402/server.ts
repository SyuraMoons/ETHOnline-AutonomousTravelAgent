import type {
  HTTPRequestContext,
  PaymentOption,
  RoutesConfig,
} from "@x402/core/http";
import {
  HTTPFacilitatorClient,
  x402HTTPResourceServer,
  x402ResourceServer,
} from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import {
  FACILITATOR_TIMEOUT_MS,
  FACILITATOR_URL,
  MAX_TIMEOUT_SECONDS,
  PAY_TO,
  X402_NETWORK as X402_NETWORK_STR,
} from "../../config.js";

/**
 * x402 resource-server wiring for the supplier — same pattern as
 * packages/frontend/services/x402/server.ts, pointed at the same self-hosted
 * facilitator (facilitator/, docker-compose.yml). Deliberately duplicated
 * rather than shared: Express doesn't hand you a Fetch `Request` the way
 * Next.js route handlers do, so the adapter below is Express-specific.
 * This process never holds FACILITATOR_PRIVATE_KEY.
 */

export const X402_NETWORK = X402_NETWORK_STR as Network;
export const HBAR_ASSET = "0.0.0";
export { MAX_TIMEOUT_SECONDS };

let serverPromise: Promise<x402ResourceServer> | null = null;

export function getResourceServer(): Promise<x402ResourceServer> {
  if (!serverPromise) {
    serverPromise = (async () => {
      // The default is 30s, and settle exceeds it under normal testnet load —
      // twice in one afternoon. That is the worst failure available here: the
      // transfer reaches consensus, the reply arrives too late, and everything
      // upstream treats a completed payment as a failure. Retrying charges the
      // buyer again. 1.10 HBAR was lost that way before this was raised.
      const facilitator = new HTTPFacilitatorClient({
        url: FACILITATOR_URL,
        timeoutMs: FACILITATOR_TIMEOUT_MS,
      });
      const server = new x402ResourceServer(facilitator).register(
        X402_NETWORK,
        new ExactHederaScheme(),
      );
      await server.initialize();
      return server;
    })().catch((error) => {
      serverPromise = null;
      throw error;
    });
  }
  return serverPromise;
}

// Base PaymentOption fields shared by every priced route on this service —
// only `price` differs per route.
function basePaymentOption(price: PaymentOption["price"]): PaymentOption {
  return {
    scheme: "exact",
    network: X402_NETWORK,
    payTo: PAY_TO,
    price,
    maxTimeoutSeconds: MAX_TIMEOUT_SECONDS,
  };
}

// Single RoutesConfig for the whole service — the library validates the full
// set against facilitator support during initialize(), so every priced route
// must be registered here, not built ad hoc per handler.
let routesConfig: RoutesConfig | null = null;

export function registerRoute(
  pattern: string,
  price: PaymentOption["price"],
): void {
  routesConfig = {
    ...(routesConfig ?? {}),
    [pattern]: { accepts: basePaymentOption(price) },
  };
  // Registering a route after the HTTP server has already initialized would
  // silently leave it unprotected — route modules must all import (and thus
  // call registerRoute) before index.ts calls getHTTPResourceServer().
  if (httpServerPromise) {
    throw new Error(
      `[supplier] registerRoute("${pattern}") called after the HTTP resource server was built`,
    );
  }
}

let httpServerPromise: Promise<x402HTTPResourceServer> | null = null;

/**
 * Builds the shared x402HTTPResourceServer from every route registered via
 * registerRoute(). Lazy so route modules can register at import time; call
 * this once at boot (see index.ts) so a bad route config fails fast on
 * startup rather than on the first request.
 */
export function getHTTPResourceServer(): Promise<x402HTTPResourceServer> {
  if (!httpServerPromise) {
    httpServerPromise = (async () => {
      if (!routesConfig)
        throw new Error("[supplier] no x402 routes registered");
      const resourceServer = await getResourceServer();
      const httpServer = new x402HTTPResourceServer(
        resourceServer,
        routesConfig,
      );
      await httpServer.initialize();
      return httpServer;
    })().catch((error) => {
      httpServerPromise = null;
      throw error;
    });
  }
  return httpServerPromise;
}

/**
 * Runs the x402 verify -> handler -> settle flow for one route. `handler`
 * only runs once payment is verified, and its return value is settled and
 * sent as JSON.
 */
export function withPayment(
  handler: (
    req: ExpressRequest,
  ) => Promise<
    { status?: number; body: unknown } | { error: string; status: number }
  >,
) {
  return async (req: ExpressRequest, res: ExpressResponse) => {
    try {
      await handlePaidRequest(handler, req, res);
    } catch (error) {
      // Express 4 does not catch rejections from an async handler, so anything
      // thrown here becomes an unhandled rejection and Node kills the process.
      // One slow facilitator was enough to take the whole supplier down mid-demo.
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[supplier] request failed: ${message}`);
      if (!res.headersSent) {
        res.status(502).json({ error: "upstream_failure", message });
      }
    }
  };
}

async function handlePaidRequest(
  handler: (
    req: ExpressRequest,
  ) => Promise<
    { status?: number; body: unknown } | { error: string; status: number }
  >,
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> {
  {
    const httpServer = await getHTTPResourceServer();
    const { context } = makeExpressHttpContext(req);

    const result = await httpServer.processHTTPRequest(context);

    if (result.type === "payment-error") {
      res
        .status(result.response.status)
        .set(result.response.headers)
        .json(result.response.body);
      return;
    }

    if (result.type === "no-payment-required") {
      // Every route in this service requires payment; reaching here means the
      // route config has no `accepts`, which is a wiring bug, not a client error.
      res.status(500).json({
        error: "supplier_misconfigured",
        message: "route has no payment requirements",
      });
      return;
    }

    const outcome = await handler(req);
    if ("error" in outcome) {
      res.status(outcome.status).json({ error: outcome.error });
      return;
    }

    let settlement;
    try {
      settlement = await httpServer.processSettlement(
        result.paymentPayload,
        result.paymentRequirements,
        result.declaredExtensions,
        undefined,
        undefined,
        result.beforeHandlerSettlement,
      );
    } catch (error) {
      // A settle that TIMES OUT has not necessarily failed — the transaction can
      // reach consensus while the facilitator's reply is still in flight. We saw
      // exactly that: 0.55 HBAR left the buyer's account, settled SUCCESS, and
      // the supplier threw here.
      //
      // So serve the body. The buyer has paid, possibly twice over if they
      // retry, and withholding what they bought is the one outcome that is
      // certainly wrong. If the settlement really did fail we have given away
      // one search — cheaper, and recoverable from the facilitator's records.
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[supplier] settlement did not confirm: ${message} — serving the response anyway`,
      );
      res
        .status(outcome.status ?? 200)
        .set({ "x-settlement-unconfirmed": "true" })
        .json(outcome.body);
      return;
    }

    if (!settlement.success) {
      res
        .status(settlement.response.status)
        .set(settlement.response.headers)
        .json(settlement.response.body);
      return;
    }

    res
      .status(outcome.status ?? 200)
      .set(settlement.headers)
      .json(outcome.body);
  }
}

export function makeExpressHttpContext(req: ExpressRequest): {
  context: HTTPRequestContext;
  resourceUrl: string;
} {
  const protocol = req.protocol;
  const host = req.get("host") ?? "localhost";
  const resourceUrl = `${protocol}://${host}${req.path}`;

  const context: HTTPRequestContext = {
    adapter: {
      getHeader: (name) => req.get(name) ?? undefined,
      getMethod: () => req.method,
      getPath: () => req.path,
      getUrl: () => `${protocol}://${host}${req.originalUrl}`,
      getAcceptHeader: () => req.get("accept") ?? "",
      getUserAgent: () => req.get("user-agent") ?? "",
      getQueryParam: (name) => {
        const value = req.query[name];
        return typeof value === "string" ? value : undefined;
      },
    },
    path: req.path,
    method: req.method,
    paymentHeader:
      req.get("payment-signature") ?? req.get("x-payment") ?? undefined,
  };

  return { context, resourceUrl };
}
