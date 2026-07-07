import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { effectiveStatus, isBlockedStatus } from "@/lib/subscription";
import { isProfileComplete } from "@/lib/clinic-profile";

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

  // ---- Internal admin panel (/admin, /api/admin) -------------------------
  // Cross-tenant, platform-owner only. Gate here as the outer defense (every
  // admin page/action re-checks independently). A non-admin gets a 404 — NEVER
  // a 403 or a login redirect — so the panel's existence is never advertised.
  const path = request.nextUrl.pathname;
  const isAdminArea =
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path === "/api/admin" ||
    path.startsWith("/api/admin/");
  if (isAdminArea) {
    let ok = false;
    if (user) {
      const { data } = await supabase.rpc("is_super_admin");
      ok = data === true;
    }
    if (!ok) {
      if (path.startsWith("/api/")) {
        return new NextResponse(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      // Rewrite to an unmatched path → App Router renders the 404 page.
      return NextResponse.rewrite(new URL("/_admin_not_found", request.url));
    }
    return supabaseResponse; // admin: allow, skip the clinic public/redirect logic
  }

  // Public routes usable without auth. Everything else requires a session.
  // /auth/callback exchanges the password-reset code (user has no session yet),
  // and /forgot-password is reached while logged out.
  const publicPaths = [
    "/",
    "/signup",
    "/tour",
    "/forgot-password",
    "/auth/callback",
  ];
  // /audit/<token> is a public prospect report (anon, token-scoped read).
  // /p/<booking_slug>/<slug> is a public hosted landing page (anon read via the
  // get_published_landing_page RPC).
  // /s/<token> is a public post-visit survey (anon, token-scoped read + submit
  // via get_survey_page_by_token / submit_survey_response).
  const isPublic =
    publicPaths.includes(request.nextUrl.pathname) ||
    request.nextUrl.pathname.startsWith("/audit/") ||
    request.nextUrl.pathname.startsWith("/p/") ||
    request.nextUrl.pathname.startsWith("/s/") ||
    // Dev-only audit test harness (app/api/dev/*). Guarded to development here
    // AND in the route itself; never reachable in production.
    (process.env.NODE_ENV === "development" &&
      request.nextUrl.pathname.startsWith("/api/dev/")) ||
    // Payment gateway webhooks — server-to-server, no session; verified by
    // signature inside the route (app/api/webhooks/cashfree).
    request.nextUrl.pathname.startsWith("/api/webhooks/") ||
    // Scheduled jobs (Vercel Cron / pg_cron) — no session; each route verifies a
    // CRON_SECRET bearer token itself (app/api/cron/*).
    request.nextUrl.pathname.startsWith("/api/cron/");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // ---- Subscription access gate --------------------------------------------
  // A deactivated/cancelled clinic (or an expired trial treated as such is NOT
  // blocked — only past_due, which stays usable) can reach ONLY /upgrade and
  // /settings (+ logout, which POSTs to whichever of those pages it's on).
  // Everything else bounces to /upgrade. Skipped for already-allowed paths so
  // we don't run the status query on every request.
  if (user && !isPublic) {
    const alwaysAllowed =
      path === "/upgrade" ||
      path.startsWith("/upgrade/") ||
      path === "/settings" ||
      path.startsWith("/settings/");
    if (!alwaysAllowed) {
      const { data: clinicRow } = await supabase
        .from("clinics")
        .select(
          "subscription_status, trial_ends_at, business_name, doctor_name, phone, city, area, address",
        )
        .maybeSingle();
      const eff = effectiveStatus(
        clinicRow?.subscription_status,
        clinicRow?.trial_ends_at,
      );
      if (isBlockedStatus(eff)) {
        if (path.startsWith("/api/")) {
          return new NextResponse(
            JSON.stringify({
              error: "Your subscription is inactive. Please upgrade.",
              upgrade: true,
            }),
            { status: 403, headers: { "content-type": "application/json" } },
          );
        }
        const url = request.nextUrl.clone();
        url.pathname = "/upgrade";
        url.search = "";
        return NextResponse.redirect(url);
      }

      // ---- Profile-completion gate (pages only, never APIs) ---------------
      // Content generation, wa.me messaging, and local SEO all assume the six
      // core clinic fields exist. Owners/doctors get walked to /settings until
      // they're filled; receptionists are never gated (they can't open
      // /settings — their owner completes setup). The role query runs ONLY
      // when the profile is incomplete, so complete clinics pay nothing.
      if (!path.startsWith("/api/") && !isProfileComplete(clinicRow)) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        if (prof?.role === "clinic_owner" || prof?.role === "doctor") {
          const url = request.nextUrl.clone();
          url.pathname = "/settings";
          url.search = "?setup=1";
          return NextResponse.redirect(url);
        }
      }
    }
  }

  return supabaseResponse;
}
