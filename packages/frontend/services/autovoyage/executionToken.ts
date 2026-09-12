import jwt from "jsonwebtoken";
import "server-only";
import { db } from "~~/services/db/supabase";

export type ExecutionTokenClaims = { itineraryHash: string; mandateId: string; jti: string };

function getSecret(): string {
  const secret = process.env.EXECUTION_TOKEN_SECRET;
  if (!secret) throw new Error("EXECUTION_TOKEN_SECRET is not configured");
  return secret;
}

// Minted once a booking is confirmed; spent by the /api/execute route, which must re-derive
// itineraryHash server-side and reject a mismatch as ActionRefused · itinerary_mismatch rather
// than trust the claim in this token. `jti` makes the token single-use: /api/execute records
// it in `used_execution_tokens` before booking, so the same token can't pay twice inside its
// TTL window (a plain jwt.verify has no notion of "already spent").
export function signExecutionToken(claims: { itineraryHash: string; mandateId: string }): string {
  const ttlSeconds = Number(process.env.EXECUTION_TOKEN_TTL_SECONDS ?? 300);
  return jwt.sign({ ...claims, jti: crypto.randomUUID() }, getSecret(), { algorithm: "HS256", expiresIn: ttlSeconds });
}

export function verifyExecutionToken(token: string): ExecutionTokenClaims {
  return jwt.verify(token, getSecret(), { algorithms: ["HS256"] }) as ExecutionTokenClaims;
}

/**
 * Spends the token's jti. Returns false if it was already used — the caller must refuse
 * rather than book. A plain insert-and-catch-conflict, so this is safe under concurrent
 * /api/execute calls for the same token.
 */
export async function claimExecutionToken(jti: string): Promise<boolean> {
  const { error } = await db().from("used_execution_tokens").insert({ jti });
  if (!error) return true;
  if (error.code === "23505") return false; // unique_violation: already spent
  throw new Error(`claimExecutionToken: ${error.message}`);
}
