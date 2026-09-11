import jwt from "jsonwebtoken";

export type ExecutionTokenClaims = { itineraryHash: string; mandateId?: string };

function getSecret(): string {
  const secret = process.env.EXECUTION_TOKEN_SECRET;
  if (!secret) throw new Error("EXECUTION_TOKEN_SECRET is not configured");
  return secret;
}

// Minted once a booking is confirmed; spent by the future
// /api/execute route, which must re-derive itineraryHash server-side and
// reject a mismatch as ActionRefused · itinerary_mismatch rather than trust
// the claim in this token.
export function signExecutionToken(claims: ExecutionTokenClaims): string {
  const ttlSeconds = Number(process.env.EXECUTION_TOKEN_TTL_SECONDS ?? 300);
  return jwt.sign(claims, getSecret(), { algorithm: "HS256", expiresIn: ttlSeconds });
}

export function verifyExecutionToken(token: string): ExecutionTokenClaims {
  return jwt.verify(token, getSecret(), { algorithms: ["HS256"] }) as ExecutionTokenClaims;
}
