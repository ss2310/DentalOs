import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-subtle px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="inline-flex items-center rounded-pill bg-primary px-3 py-1 text-xs font-semibold text-white">
            GrowthOS
          </span>
          <h1 className="mt-4 text-2xl font-semibold text-text-primary">
            Reset your password
          </h1>
          <p className="mt-1 text-[15px] text-text-secondary">
            We&apos;ll email you a link to set a new one.
          </p>
        </div>

        <div className="rounded-card border border-border bg-white p-6 sm:p-8">
          {searchParams.error === "link" ? (
            <p className="mb-4 rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              That reset link was invalid or expired. Request a new one below.
            </p>
          ) : null}
          <ForgotPasswordForm />
        </div>

        <p className="mt-4 text-center text-sm text-text-secondary">
          <Link href="/" className="font-medium text-primary hover:underline">
            ← Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
