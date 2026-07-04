import Link from "next/link";
import { requireSuperAdmin } from "@/lib/admin/auth";
import { AdminNav } from "./admin-nav";

export const dynamic = "force-dynamic";

// Separate, minimal shell for the platform-owner panel — deliberately NOT the
// clinic AppShell. Dark bar + indigo accent (not the clinic's teal) so it's
// always obvious you're in cross-tenant admin mode. Middleware already gates
// this; requireSuperAdmin() here is the independent second check (404 if not).
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSuperAdmin();

  return (
    <div className="min-h-screen bg-subtle">
      {/* Indigo signal strip — a constant reminder this isn't the clinic app. */}
      <div className="h-1 w-full bg-[#4F46E5]" />
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 bg-[#17162b] px-4 py-3 sm:px-6">
        <Link href="/admin/clinics" className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-white">GrowthOS</span>
          <span className="rounded-pill bg-[#4F46E5] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white">
            Admin
          </span>
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <AdminNav />
          <Link
            href="/dashboard"
            className="text-sm text-white/60 hover:text-white"
          >
            Exit ↩
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
