import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole, type UserRole } from "@/lib/roles";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already gates these routes; this is a defense-in-depth check.
  if (!user) {
    redirect("/");
  }

  // RLS returns only the logged-in user's own clinic.
  const [{ data: clinic }, { data: profile }] = await Promise.all([
    supabase.from("clinics").select("business_name").single(),
    supabase
      .from("profiles")
      .select("unread_notification_count, is_agency, role")
      .eq("id", user.id)
      .single(),
  ]);

  return (
    <AppShell
      clinicName={clinic?.business_name ?? "GrowthOS"}
      unreadCount={profile?.unread_notification_count ?? 0}
      isAgency={profile?.is_agency ?? false}
      isAdmin={isAdminRole(profile?.role as UserRole | undefined)}
    >
      {children}
    </AppShell>
  );
}
