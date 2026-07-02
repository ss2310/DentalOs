import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  const { data: clinic } = await supabase
    .from("clinics")
    .select("business_name")
    .single();

  return (
    <AppShell clinicName={clinic?.business_name ?? "GrowthOS"}>
      {children}
    </AppShell>
  );
}
