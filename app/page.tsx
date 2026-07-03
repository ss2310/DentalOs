import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ToothIcon } from "@/components/icons";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
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
          <div className="inline-flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-card bg-primary/10 text-primary">
              <ToothIcon width={24} height={24} />
            </span>
            <span className="text-2xl font-semibold tracking-tight text-text-primary">
              GrowthOS
            </span>
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-[-0.02em] text-text-primary">
            Welcome back
          </h1>
          <p className="mt-1 text-[15px] text-text-secondary">
            Sign in to your clinic dashboard
          </p>
        </div>

        <div className="rounded-card border border-border bg-white p-6 shadow-card sm:p-8">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
