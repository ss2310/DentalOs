import { ResetPasswordForm } from "./reset-password-form";

// Reached only with a valid recovery session (set by /auth/callback after the
// email link). Middleware protects it, so a session is guaranteed here.
export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-subtle px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="inline-flex items-center rounded-pill bg-primary px-3 py-1 text-xs font-semibold text-white">
            GrowthOS
          </span>
          <h1 className="mt-4 text-2xl font-semibold text-text-primary">
            Set a new password
          </h1>
          <p className="mt-1 text-[15px] text-text-secondary">
            Choose a new password for your account.
          </p>
        </div>

        <div className="rounded-card border border-border bg-white p-6 sm:p-8">
          <ResetPasswordForm />
        </div>
      </div>
    </main>
  );
}
