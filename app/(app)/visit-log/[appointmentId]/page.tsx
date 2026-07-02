import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime, nowIST } from "@/lib/format";
import { VisitLogForm } from "./visit-log-form";

type RateCard = { id: string; treatment_name: string; base_price: string };

export default async function VisitLogPage({
  params,
}: {
  params: { appointmentId: string };
}) {
  const supabase = createClient();

  // RLS-scoped. Load appointment + patient + treatment for the header/prefill.
  const { data: appt } = await supabase
    .from("appointments")
    .select(
      "id, appointment_time, doctor, treatment_type_id, patient_id, patient:patient_id(full_name), treatment:treatment_type_id(treatment_name)",
    )
    .eq("id", params.appointmentId)
    .maybeSingle();

  if (!appt) notFound();

  const patientName =
    (appt.patient as unknown as { full_name: string } | null)?.full_name ??
    "patient";
  const treatmentName =
    (appt.treatment as unknown as { treatment_name: string } | null)
      ?.treatment_name ?? "No treatment set";

  const [{ data: existingVisit }, { data: rateCardData }, { data: clinic }] =
    await Promise.all([
      supabase
        .from("visit_logs")
        .select("id")
        .eq("appointment_id", params.appointmentId)
        .maybeSingle(),
      supabase
        .from("rate_cards")
        .select("id, treatment_name, base_price")
        .eq("is_active", true)
        .order("treatment_name", { ascending: true }),
      supabase.from("clinics").select("doctor_name").single(),
    ]);

  const today = nowIST().date;

  const Header = (
    <div>
      <Link
        href="/appointments"
        className="text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        ← Appointments
      </Link>
      <div className="mt-3 rounded-card border border-border bg-white p-5">
        <h1 className="text-2xl font-semibold text-text-primary">
          {patientName}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
          <span>{formatDate(today)}</span>
          <span>{formatTime(appt.appointment_time)}</span>
          <span>{treatmentName}</span>
        </div>
      </div>
    </div>
  );

  // Guard: one visit per appointment.
  if (existingVisit) {
    return (
      <div className="mx-auto max-w-2xl">
        {Header}
        <div className="mt-4 rounded-card border border-border bg-white p-8 text-center">
          <p className="text-[15px] text-text-secondary">
            A visit has already been logged for this appointment.
          </p>
          <Link
            href={`/patients/${appt.patient_id}`}
            className="mt-3 inline-flex h-11 items-center rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
          >
            View patient
          </Link>
        </div>
      </div>
    );
  }

  const rateCards = (rateCardData as RateCard[]) ?? [];
  // Preselect the appointment's treatment only if it's an active rate card.
  const initialTreatmentId =
    appt.treatment_type_id &&
    rateCards.some((r) => r.id === appt.treatment_type_id)
      ? appt.treatment_type_id
      : "";
  const initialDoctor = appt.doctor ?? clinic?.doctor_name ?? "";

  return (
    <div className="mx-auto max-w-2xl">
      {Header}

      <div className="mt-4 rounded-card border border-border bg-white p-5">
        <p className="mb-4 text-sm font-medium uppercase tracking-wide text-text-secondary">
          Log Visit
        </p>
        <VisitLogForm
          appointmentId={appt.id}
          rateCards={rateCards}
          initialTreatmentId={initialTreatmentId}
          initialDoctor={initialDoctor}
        />
      </div>
    </div>
  );
}
