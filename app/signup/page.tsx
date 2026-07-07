import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { multiVerticalEnabled } from "@/lib/multi-vertical-access";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  // Multi-vertical onboarding: only when the flag is on do we offer a vertical
  // picker. The visitor is unauthenticated, and `verticals` is RLS-readable only
  // to authenticated users, so we read the (non-sensitive) active list with the
  // service-role client. Off ⇒ null ⇒ no dropdown, new clinics default to dental.
  let verticals: { id: string; display_name: string }[] | null = null;
  if (multiVerticalEnabled()) {
    const { data } = await createAdminClient()
      .from("verticals")
      .select("id, display_name")
      .eq("is_active", true)
      .order("display_name", { ascending: true });
    verticals = data ?? [];
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-subtle px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="inline-flex items-center rounded-pill bg-primary px-3 py-1 text-xs font-semibold text-white">
            GrowthOS
          </span>
          <h1 className="mt-4 text-2xl font-semibold text-text-primary">
            Start your 30-day free trial
          </h1>
          <p className="mt-1 text-[15px] text-text-secondary">
            Set up your clinic — no credit card required
          </p>
        </div>

        <div className="rounded-card border border-border bg-white p-6 sm:p-8">
          <SignupForm verticals={verticals} />
        </div>
      </div>
    </main>
  );
}
