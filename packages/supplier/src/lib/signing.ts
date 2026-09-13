import { canonicalJson } from "@sh/contracts";
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { SUPPLIER_SIGNING_KEY } from "../config.js";

// SUPPLIER_SIGNING_KEY is a base64 PKCS8 Ed25519 private key. Generate one
// with `npm run supplier:gen-signing-key` — never reuse a funded Hedera
// account key here, this signs booking confirmations, not transactions.
const privateKey = createPrivateKey({
  key: Buffer.from(SUPPLIER_SIGNING_KEY, "base64"),
  format: "der",
  type: "pkcs8",
});

export const supplierPublicKeyBase64 = createPublicKey(privateKey)
  .export({ format: "der", type: "spki" })
  .toString("base64");

/** Ed25519-signs the canonical JSON of `payload`. Returns a base64 signature. */
export function signPayload(payload: unknown): string {
  const message = Buffer.from(canonicalJson(payload), "utf-8");
  return sign(null, message, privateKey).toString("base64");
}
