import { createClient } from "@/lib/supabase/server";
import { nowIST, addDays, formatDate } from "@/lib/format";
import type {
  AppointmentRow,
  PatientOption,
  RateCardOption,
} from "@/lib/types";
import { AppointmentsToolbar } from "./appointments-toolbar";
import { AppointmentsList } from "./appointments-list";
import { buildWaActions } from "./wa-actions";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const now = nowIST();
  const today = now.date;
  const tomorrow = addDays(today, 1);
  const selected =
    searchParams.date && DATE_RE.test(searchParams.date)
      ? searchParams.date
      : today;

  const supabase = createClient();

  // All RLS-scoped to the caller's clinic.
  const [apptRes, rateCardRes, patientRes, clinicRes] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, patient_id, appointment_date, appointment_time, treatment_type_id, doctor, status, notes, reminder_24h_sent_at, reminder_1h_sent_at, recovery_sent_at, review_requested, patient:patient_id(full_name, whatsapp_number), treatment:treatment_type_id(treatment_name)",
      )
      .eq("appointment_date", selected)
      .order("appointment_time", { ascending: true }),
    supabase
      .from("rate_cards")
      .select("id, treatment_name")
      .eq("is_active", true)
      .order("treatment_name", { ascending: true }),
    supabase
      .from("patients")
      .select("id, full_name, whatsapp_number, phone")
      .order("full_name", { ascending: true }),
    supabase
      .from("clinics")
      .select("doctor_name, phone, google_review_url")
      .single(),
  ]);

  const appts = (apptRes.data as unknown as AppointmentRow[]) ?? [];
  const rateCards = (rateCardRes.data as RateCardOption[]) ?? [];
  const patients = (patientRes.data as PatientOption[]) ?? [];
  const doctorName = clinicRes.data?.doctor_name ?? "";
  const clinicWa = {
    phone: clinicRes.data?.phone ?? null,
    google_review_url: clinicRes.data?.google_review_url ?? null,
  };

  return (
    <div>
      <AppointmentsToolbar
        today={today}
        tomorrow={tomorrow}
        selected={selected}
        patients={patients}
        rateCards={rateCards}
        doctorName={doctorName}
      />

      <div className="mt-6">
        <AppointmentsList
          items={appts.map((appt) => ({
            appt,
            isPast:
              appt.appointment_date < now.date ||
              (appt.appointment_date === now.date &&
                appt.appointment_time < now.time),
            waActions: buildWaActions(appt, clinicWa, now, tomorrow),
          }))}
          dateLabel={formatDate(selected)}
        />
      </div>
    </div>
  );
}
