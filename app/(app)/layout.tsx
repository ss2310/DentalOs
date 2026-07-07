import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole, type UserRole } from "@/lib/roles";
import { effectiveStatus, isPastDueStatus } from "@/lib/subscription";
import { voiceNotesEnabledForClinic } from "@/lib/voice-notes-access";
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
    supabase
      .from("clinics")
      .select("business_name, subscription_status, trial_ends_at, feature_flags")
      .single(),
    supabase
      .from("profiles")
      .select("unread_notification_count, is_agency, role, is_super_admin")
      .eq("id", user.id)
      .single(),
  ]);

  const pastDue = isPastDueStatus(
    effectiveStatus(clinic?.subscription_status, clinic?.trial_ends_at),
  );

  return (
    <AppShell
      clinicName={clinic?.business_name ?? "GrowthOS"}
      unreadCount={profile?.unread_notification_count ?? 0}
      isAgency={profile?.is_agency ?? false}
      isAdmin={isAdminRole(profile?.role as UserRole | undefined)}
      isSuperAdmin={profile?.is_super_admin ?? false}
      pastDue={pastDue}
      voiceNotes={voiceNotesEnabledForClinic(clinic?.feature_flags)}
    >
      {children}
    </AppShell>
  );
}
