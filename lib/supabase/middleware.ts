import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request and keeps the
 * auth cookies in sync between the browser and the server. Call this from
 * the root middleware. Do not run other logic between creating the client
 * and calling getUser() — it can desync the session.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Touch the session so expired tokens get refreshed and re-set as cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public routes usable without auth. Everything else requires a session.
  // /auth/callback exchanges the password-reset code (user has no session yet),
  // and /forgot-password is reached while logged out.
  const publicPaths = ["/", "/signup", "/forgot-password", "/auth/callback"];
  // /audit/<token> is a public prospect report (anon, token-scoped read).
  const isPublic =
    publicPaths.includes(request.nextUrl.pathname) ||
    request.nextUrl.pathname.startsWith("/audit/");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
