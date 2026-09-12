import "server-only";
import { db } from "~~/services/db/supabase";

// Postgres-backed booking-confirm session store, keyed by sessionId (see supabase/schema.sql
// `consent_sessions`). Previously an in-memory Map pinned to globalThis — that was wiped by
// every server restart, silently invalidating any confirm session still in flight.
//
// A session records the itineraryHash AND mandateId it was opened with, so verify can confirm
// the confirm click is bound to the exact booking the user was shown, for the exact mandate
// that's about to pay — a proof obtained for one itinerary/mandate must not be redeemable for
// another.

type ConsentSession = { itineraryHash: string; mandateId: string; createdAt: number };

const SESSION_TTL_MS = 10 * 60 * 1000;

export async function createConsentSession(sessionId: string, itineraryHash: string, mandateId: string): Promise<void> {
  const { error } = await db()
    .from("consent_sessions")
    .insert({ session_id: sessionId, itinerary_hash: itineraryHash, mandate_id: mandateId });
  if (error) throw new Error(`createConsentSession: ${error.message}`);
}

/**
 * Atomically claims the session: only the first caller to mark it consumed gets it back, so
 * two concurrent verifies for the same sessionId can't both mint a valid execution token
 * (the old implementation read-then-deleted, which raced). Callers must not call this and
 * then separately delete — this IS the single-use claim.
 */
export async function claimConsentSession(sessionId: string): Promise<ConsentSession | undefined> {
  const cutoff = new Date(Date.now() - SESSION_TTL_MS).toISOString();
  const { data, error } = await db()
    .from("consent_sessions")
    .update({ consumed_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .is("consumed_at", null)
    .gt("created_at", cutoff)
    .select("itinerary_hash, mandate_id, created_at")
    .maybeSingle();
  if (error) throw new Error(`claimConsentSession: ${error.message}`);
  if (!data) return undefined;
  return {
    itineraryHash: data.itinerary_hash,
    mandateId: data.mandate_id,
    createdAt: new Date(data.created_at).getTime(),
  };
}
