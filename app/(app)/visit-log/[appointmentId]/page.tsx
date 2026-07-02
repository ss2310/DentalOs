import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/format";

export default async function VisitLogPage({
  params,
}: {
  params: { appointmentId: string };
}) {
  const supabase = createClient();

  // RLS-scoped; used only to show context on the placeholder.
  const { data: appt } = await supabase
    .from("appointments")
    .select(
      "id, appointment_date, appointment_time, patient:patient_id(full_name)",
    )
    .eq("id", params.appointmentId)
    .maybeSingle();

  const patientName =
    (appt?.patient as unknown as { full_name: string } | null)?.full_name ??
    "patient";

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/appointments"
        className="text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        ← Appointments
      </Link>

      <h1 className="mt-3 text-2xl font-semibold text-text-primary">
        Log Visit
      </h1>
      {appt ? (
        <p className="mt-1 text-sm uppercase tracking-wide text-text-secondary">
          {patientName} · {formatDate(appt.appointment_date)} ·{" "}
          {formatTime(appt.appointment_time)}
        </p>
      ) : null}

      <div className="mt-6 rounded-card border border-border bg-white p-8 text-center">
        <p className="text-[15px] text-text-secondary">
          Visit logging — coming soon.
        </p>
      </div>
    </div>
  );
}
