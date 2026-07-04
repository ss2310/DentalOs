import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
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
          <SignupForm />
        </div>
      </div>
    </main>
  );
}
