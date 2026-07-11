import { createClient } from "@/lib/supabase/server";
import { nowIST } from "@/lib/format";
import { DaysheetClient, type DaysheetPayment, type DaysheetVisit } from "./daysheet-client";

// The Daysheet — the day's register, the page a receptionist reconciles the
// cash drawer against every evening. Production = work charged today
// (visit_logs.cost). Collection = money actually received today (payments
// ledger — includes recoveries of OLD dues, which is why the two differ).
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function DaysheetPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const today = nowIST().date;
  const date =
    searchParams.date && DATE_RE.test(searchParams.date)
      ? searchParams.date
      : today;

  const supabase = createClient();
  const [visitRes, paymentRes, clinicRes] = await Promise.all([
    supabase
      .from("visit_logs")
      .select(
        "id, visit_date, treatment_name_text, doctor, cost, amount_paid, outstanding_amount, payment_status, patient:patient_id(id, full_name)",
      )
      .eq("visit_date", date)
      .order("created_at", { ascending: true }),
    // Payments ledger (052/053). Errors → null before the migrations run;
    // the page renders with an empty Collection rather than crashing.
    supabase
      .from("payments")
      .select(
        "id, amount, payment_mode, payment_date, receipt_no, patient:patient_id(id, full_name, whatsapp_number), visit:visit_log_id(treatment_name_text)",
      )
      .eq("payment_date", date)
      .order("created_at", { ascending: true }),
    supabase.from("clinics").select("business_name").single(),
  ]);

  const visits = (visitRes.data as unknown as DaysheetVisit[]) ?? [];
  const payments = (paymentRes.data as unknown as DaysheetPayment[]) ?? [];

  return (
    <DaysheetClient
      date={date}
      today={today}
      visits={visits}
      payments={payments}
      clinicName={clinicRes.data?.business_name ?? ""}
    />
  );
}
