import { createClient } from "@/lib/supabase/server";
import type { Patient } from "@/lib/types";
import { PatientsClient } from "./patients-client";

export default async function PatientsPage() {
  const supabase = createClient();

  // RLS restricts every query to the logged-in user's clinic.
  const [
    { data: patients },
    { data: visitTreatments },
    { data: caseTreatments },
    { data: rateCards },
  ] = await Promise.all([
    supabase
      .from("patients")
      .select(
        "id, full_name, whatsapp_number, phone, date_of_birth, gender, area, notes, total_visits, lifetime_revenue, total_outstanding, last_visit_date, created_at",
      )
      .order("created_at", { ascending: false }),
    // Patient → treatment map for the treatment filter + "By treatment" view:
    // what they've HAD (visit history) and what's PROPOSED (pipeline cases).
    supabase.from("visit_logs").select("patient_id, treatment_name_text"),
    supabase
      .from("case_pipeline")
      .select("patient_id, treatment:treatment_id(treatment_name)"),
    supabase
      .from("rate_cards")
      .select("treatment_name")
      .eq("is_active", true)
      .order("treatment_name", { ascending: true }),
  ]);

  // Aggregate to patientId → unique treatment names (small, clinic-scale data).
  const treatmentsByPatient: Record<string, string[]> = {};
  const add = (patientId: string, name: string | null | undefined) => {
    if (!name) return;
    const list = (treatmentsByPatient[patientId] ??= []);
    if (!list.includes(name)) list.push(name);
  };
  for (const v of (visitTreatments as
    | { patient_id: string; treatment_name_text: string | null }[]
    | null) ?? []) {
    add(v.patient_id, v.treatment_name_text);
  }
  for (const c of (caseTreatments as unknown as
    | { patient_id: string; treatment: { treatment_name: string } | null }[]
    | null) ?? []) {
    add(c.patient_id, c.treatment?.treatment_name);
  }

  // Filter options: the active catalog plus any snapshotted names still in use.
  const options = new Set<string>(
    ((rateCards as { treatment_name: string }[] | null) ?? []).map(
      (r) => r.treatment_name,
    ),
  );
  for (const names of Object.values(treatmentsByPatient)) {
    for (const n of names) options.add(n);
  }

  return (
    <PatientsClient
      patients={(patients as Patient[]) ?? []}
      treatmentsByPatient={treatmentsByPatient}
      treatmentOptions={Array.from(options).sort((a, b) => a.localeCompare(b))}
    />
  );
}
