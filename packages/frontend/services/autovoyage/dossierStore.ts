import type { TripDossier } from "@sh/contracts";
import "server-only";
import { db } from "~~/services/db/supabase";

/**
 * Postgres-backed dossier store, keyed by dossierId (see supabase/schema.sql `dossiers`).
 * Previously an in-memory Map pinned to globalThis — a dossier has to survive the gap between
 * the autonomous run finishing (report) and the user clicking "Book everything" (buy) a
 * request later, which a server restart would otherwise silently drop.
 */

const DOSSIER_TTL_MS = 30 * 60 * 1000;

export async function saveDossier(dossier: TripDossier): Promise<void> {
  const { error } = await db().from("dossiers").upsert({ dossier_id: dossier.dossierId, data: dossier });
  if (error) throw new Error(`saveDossier: ${error.message}`);
}

export async function getDossier(dossierId: string): Promise<TripDossier | undefined> {
  const { data, error } = await db()
    .from("dossiers")
    .select("data, created_at")
    .eq("dossier_id", dossierId)
    .maybeSingle();
  if (error) throw new Error(`getDossier: ${error.message}`);
  if (!data) return undefined;
  if (Date.now() - new Date(data.created_at).getTime() > DOSSIER_TTL_MS) return undefined;
  return data.data as TripDossier;
}
