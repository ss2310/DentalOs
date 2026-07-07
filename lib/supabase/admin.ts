import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. BYPASSES Row Level Security — use only in
 * trusted server code (Route Handlers, Server Actions) for operations that
 * legitimately cross the clinic boundary, e.g.:
 *   - onboarding a new clinic + its first owner
 *   - seeding / updating the global post_types table
 *   - background jobs (recall generation, age-bucket advancement)
 *
 * NEVER expose this to the browser. The `server-only` import above makes the
 * build fail if this module is ever pulled into a client bundle.
 *
 * IMPORTANT: because RLS is off here, YOU are responsible for filtering by
 * clinic_id in every query. A missing filter is a cross-tenant data leak.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    // Next.js caches `fetch` GETs by default, which makes PostgREST SELECTs
    // return stale snapshots when the same row is re-read within a request
    // (e.g. the audit pipeline re-reading a run between stages). Force no-store
    // so every read hits the DB — this client is server-only trusted code.
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, cache: "no-store" }),
    },
  });
}
