import { type SupabaseClient, createClient } from "@supabase/supabase-js";
import "server-only";

/**
 * Server-only Supabase client, service-role key. Never import this from a "use client"
 * component — the `server-only` import throws at build time if you try.
 *
 * Fails fast at first use (not at module load) so scripts/tests that don't touch the DB
 * (e.g. allowance-refusals.ts, which exercises the pure checkMandate() path) don't need
 * these env vars set.
 */

let client: SupabaseClient | undefined;

export function db(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to use the database.");
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
