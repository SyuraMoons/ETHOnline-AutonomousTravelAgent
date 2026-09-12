/**
 * Builds and signs an AgentIdentityClaimed registry event, binding this supplier's agentId to
 * its existing Ed25519 signing key (the same key served as `bookingPublicKey` at
 * GET /.well-known/x402) — an HCS-14-style self-attested identity claim.
 *
 * Runs inside packages/supplier because SUPPLIER_SIGNING_KEY (the private key) must never leave
 * this package. Prints the signed claim JSON to stdout; pipe it into
 * packages/frontend/scripts/hcs-register-supplier.ts to submit it to the registry topic.
 *
 * Usage:  npm run sign-identity-claim > claim.json
 */
import { canonicalJson } from "@sh/contracts";
import { signPayload, supplierPublicKeyBase64 } from "../src/lib/signing.js";

const agentId = "meridian-flight-data";
const timestamp = new Date().toISOString();
const v = 1 as const;

const body = {
  agentId,
  publicKeyBase64: supplierPublicKeyBase64,
  v,
  timestamp,
};
const signature = signPayload(body);

// Sanity check before printing — a claim that doesn't verify against its own key is useless.
canonicalJson(body);

console.log(
  JSON.stringify(
    {
      type: "AgentIdentityClaimed",
      v,
      timestamp,
      agentId,
      publicKeyBase64: supplierPublicKeyBase64,
      signature,
    },
    null,
    2,
  ),
);
