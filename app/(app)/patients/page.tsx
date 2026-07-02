import { createClient } from "@/lib/supabase/server";
import type { Patient } from "@/lib/types";
import { PatientsClient } from "./patients-client";

export default async function PatientsPage() {
  const supabase = createClient();

  // RLS restricts this to the logged-in user's clinic.
  const { data: patients } = await supabase
    .from("patients")
    .select(
      "id, full_name, whatsapp_number, phone, date_of_birth, gender, area, notes, total_visits, lifetime_revenue, total_outstanding, last_visit_date, created_at",
    )
    .order("created_at", { ascending: false });

  return <PatientsClient patients={(patients as Patient[]) ?? []} />;
}
