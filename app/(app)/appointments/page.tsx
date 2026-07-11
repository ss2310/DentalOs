import { createClient } from "@/lib/supabase/server";
import { nowIST, addDays, formatDate } from "@/lib/format";
import type {
  AppointmentRow,
  PatientOption,
  RateCardOption,
} from "@/lib/types";
import { AppointmentsToolbar, type ScheduleView } from "./appointments-toolbar";
import { AppointmentsList } from "./appointments-list";
import { ScheduleGrid } from "./schedule-grid";
import { buildWaActions } from "./wa-actions";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VIEWS: ScheduleView[] = ["list", "day", "week"];

/** Monday of the week containing `date` (YYYY-MM-DD). */
function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(date, -offset);
}

/** Short column label, e.g. "Mon 13 Jul". */
function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  return `${weekday} ${formatDate(date).slice(0, 6)}`;
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: { date?: string; view?: string };
}) {
  const now = nowIST();
  const today = now.date;
  const tomorrow = addDays(today, 1);
  const selected =
    searchParams.date && DATE_RE.test(searchParams.date)
      ? searchParams.date
      : today;
  const view: ScheduleView = VIEWS.includes(searchParams.view as ScheduleView)
    ? (searchParams.view as ScheduleView)
    : "list";

  // The calendar needs a range; list/day need one date.
  const rangeStart = view === "week" ? mondayOf(selected) : selected;
  const rangeEnd = view === "week" ? addDays(rangeStart, 6) : selected;

  const supabase = createClient();

  // All RLS-scoped to the caller's clinic.
  const [apptRes, rateCardRes, patientRes, clinicRes] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, patient_id, appointment_date, appointment_time, treatment_type_id, doctor, status, notes, reminder_24h_sent_at, reminder_1h_sent_at, recovery_sent_at, review_requested, patient:patient_id(full_name, whatsapp_number), treatment:treatment_type_id(treatment_name)",
      )
      .gte("appointment_date", rangeStart)
      .lte("appointment_date", rangeEnd)
      .order("appointment_date", { ascending: true })
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

  const gridDays =
    view === "week"
      ? Array.from({ length: 7 }, (_, i) => {
          const date = addDays(rangeStart, i);
          return { date, label: dayLabel(date) };
        })
      : [{ date: selected, label: dayLabel(selected) }];

  return (
    <div>
      <AppointmentsToolbar
        today={today}
        tomorrow={tomorrow}
        selected={selected}
        view={view}
        patients={patients}
        rateCards={rateCards}
        doctorName={doctorName}
      />

      <div className="mt-6">
        {view === "list" ? (
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
        ) : (
          <ScheduleGrid
            days={gridDays}
            appts={appts}
            patients={patients}
            rateCards={rateCards}
            doctorName={doctorName}
            today={today}
          />
        )}
      </div>
    </div>
  );
}
