import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use in Server Components, Route Handlers, and
 * Server Actions. Reads/writes the auth session from Next's cookie store
 * so RLS runs as the logged-in user.
 *
 * Note: in a Server Component the cookie `set` calls will throw (components
 * can't write headers); that's expected and safely ignored — the session is
 * refreshed by middleware instead.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — ignore. Middleware refreshes
            // the session, so this is a no-op in that context.
          }
        },
      },
    },
  );
}
