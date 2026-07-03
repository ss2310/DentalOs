import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing point for the password-reset email link. Supabase redirects here with
// a one-time `code`; we exchange it for a session (sets the auth cookies) and
// forward the user to the page named in `next` (the reset form).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

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
