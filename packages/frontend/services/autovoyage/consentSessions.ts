import "server-only";
import { db } from "~~/services/db/supabase";

// Postgres-backed booking-confirm session store, keyed by sessionId (see supabase/schema.sql
// `consent_sessions`). Previously an in-memory Map pinned to globalThis — that was wiped by
// every server restart, silently invalidating any confirm session still in flight.
//
// A session records the itineraryHash it was opened with, so verify can confirm the
// confirm click is bound to the exact booking the user was shown — a proof obtained for
// one itinerary must not be redeemable for another.

type ConsentSession = { itineraryHash: string; createdAt: number };

const SESSION_TTL_MS = 10 * 60 * 1000;

export async function createConsentSession(sessionId: string, itineraryHash: string): Promise<void> {
  const { error } = await db()
    .from("consent_sessions")
    .insert({ session_id: sessionId, itinerary_hash: itineraryHash });
  if (error) throw new Error(`createConsentSession: ${error.message}`);
}

export async function getConsentSession(sessionId: string): Promise<ConsentSession | undefined> {
  const { data, error } = await db()
    .from("consent_sessions")
    .select("itinerary_hash, created_at, consumed_at")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new Error(`getConsentSession: ${error.message}`);
  if (!data || data.consumed_at) return undefined;

  const createdAt = new Date(data.created_at).getTime();
  if (Date.now() - createdAt > SESSION_TTL_MS) return undefined;
  return { itineraryHash: data.itinerary_hash, createdAt };
}

export async function consumeConsentSession(sessionId: string): Promise<void> {
  const { error } = await db().from("consent_sessions").delete().eq("session_id", sessionId);
  if (error) throw new Error(`consumeConsentSession: ${error.message}`);
}
