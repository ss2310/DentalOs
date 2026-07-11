import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatINR } from "@/lib/format";
import { PrintButton } from "./print-button";

// Printable payment receipt. Lives OUTSIDE the (app) group so it renders
// without the sidebar/header — a clean sheet for printing or saving as PDF.
// Auth + RLS still apply: only the clinic's own staff can open it.
export const dynamic = "force-dynamic";

const MODE_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  insurance: "Insurance",
};

export default async function ReceiptPage({
  params,
}: {
  params: { paymentId: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: payment }, { data: clinic }] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id, amount, payment_mode, payment_date, receipt_no, patient:patient_id(full_name, patient_code), visit:visit_log_id(treatment_name_text, visit_date), outstanding:outstanding_id(nett_due)",
      )
      .eq("id", params.paymentId)
      .maybeSingle(),
    supabase
      .from("clinics")
      .select("business_name, doctor_name, phone, address, area, city")
      .single(),
  ]);

  if (!payment) notFound();

  const p = payment as unknown as {
    id: string;
    amount: string;
    payment_mode: string;
    payment_date: string;
    receipt_no: string | null;
    patient: { full_name: string; patient_code: string | null } | null;
    visit: { treatment_name_text: string | null; visit_date: string } | null;
    outstanding: { nett_due: string } | null;
  };
  const remaining = Number(p.outstanding?.nett_due ?? 0) || 0;
  const address = [clinic?.address, clinic?.area, clinic?.city]
    .filter(Boolean)
    .join(", ");

  return (
    <main className="mx-auto max-w-lg px-6 py-10 print:max-w-none print:p-0">
      {/* Screen-only controls */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link
          href="/daysheet"
          className="text-sm font-medium text-text-secondary hover:text-text-primary"
        >
          ← Back
        </Link>
        <PrintButton />
      </div>

      {/* The receipt sheet */}
      <div className="rounded-card border border-border bg-white p-8 print:rounded-none print:border-0 print:p-0">
        <div className="border-b border-border pb-5 text-center">
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-text-primary">
            {clinic?.business_name ?? "Clinic"}
          </h1>
          {clinic?.doctor_name ? (
            <p className="mt-0.5 text-sm text-text-secondary">
              {clinic.doctor_name}
            </p>
          ) : null}
          {address ? (
            <p className="mt-0.5 text-sm text-text-secondary">{address}</p>
          ) : null}
          {clinic?.phone ? (
            <p className="mt-0.5 text-sm text-text-secondary">
              📞 {clinic.phone}
            </p>
          ) : null}
        </div>

        <div className="flex items-baseline justify-between pt-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
            Payment Receipt
          </h2>
          <span className="text-sm font-medium text-text-primary">
            {p.receipt_no ?? "—"}
          </span>
        </div>

        <dl className="mt-4 space-y-2.5 text-[15px]">
          <div className="flex justify-between gap-4">
            <dt className="text-text-secondary">Date</dt>
            <dd className="font-medium text-text-primary">
              {formatDate(p.payment_date)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-text-secondary">Patient</dt>
            <dd className="text-right font-medium text-text-primary">
              {p.patient?.full_name ?? "—"}
              {p.patient?.patient_code ? (
                <span className="ml-1.5 text-text-secondary">
                  #{p.patient.patient_code}
                </span>
              ) : null}
            </dd>
          </div>
          {p.visit?.treatment_name_text ? (
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Towards</dt>
              <dd className="text-right font-medium text-text-primary">
                {p.visit.treatment_name_text}
                {p.visit.visit_date ? (
                  <span className="ml-1.5 text-text-secondary">
                    (visit {formatDate(p.visit.visit_date)})
                  </span>
                ) : null}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-text-secondary">Mode</dt>
            <dd className="font-medium text-text-primary">
              {MODE_LABEL[p.payment_mode] ?? p.payment_mode}
            </dd>
          </div>
        </dl>

        <div className="mt-5 flex items-center justify-between rounded-button bg-subtle px-4 py-3.5 print:border print:border-border">
          <span className="text-[15px] font-medium text-text-secondary">
            Amount received
          </span>
          <span className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">
            {formatINR(p.amount)}
          </span>
        </div>

        {remaining > 0 ? (
          <p className="mt-3 text-sm text-text-secondary">
            Balance remaining on this treatment:{" "}
            <span className="font-medium text-danger">{formatINR(remaining)}</span>
          </p>
        ) : null}

        <p className="mt-8 border-t border-border pt-4 text-center text-sm text-text-secondary">
          Thank you for your visit 🙏
        </p>
      </div>
    </main>
  );
}
