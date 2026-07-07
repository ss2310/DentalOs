import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing point for the password-reset email link. Supabase redirects here with
// a one-time `code`; we exchange it for a session (sets the auth cookies) and
// forward the user to the page named in `next` (the reset form).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // SEC-L3: only allow a same-site absolute PATH. Must start with a single "/"
  // and not "//" (which would be protocol-relative → open redirect to another
  // host). Anything else falls back to the dashboard.
  const rawNext = searchParams.get("next") ?? "/dashboard";
  const next = /^\/(?!\/)/.test(rawNext) ? rawNext : "/dashboard";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Bad or expired link — send them back to request a fresh one.
  return NextResponse.redirect(`${origin}/forgot-password?error=link`);
}
