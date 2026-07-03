import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatINR, formatDate } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { AGE_BUCKET, type AgeBucket } from "@/lib/age-bucket";
import {
  PageHeader,
  StatGrid,
  StatCard,
  SectionHeader,
  EmptyState,
} from "@/components/page";
import { BillingRowActions } from "./billing-actions";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const OVERDUE: AgeBucket[] = ["days_30", "days_60", "days_90_plus"];

type OutstandingRow = {
  id: string;
  patient_id: string;
  total_amount: string;
  amount_paid: string;
  nett_due: string;
  age_bucket: AgeBucket;
  payment_reminder_sent_at: string | null;
  patient: { full_name: string; whatsapp_number: string | null } | null;
  visit: { visit_date: string; treatment_name_text: string } | null;
};

export default async function BillingPage() {
  const supabase = createClient();

  // RLS-scoped. Only open balances.
  const { data } = await supabase
    .from("outstandings")
    .select(
      "id, patient_id, total_amount, amount_paid, nett_due, age_bucket, payment_reminder_sent_at, patient:patient_id(full_name, whatsapp_number), visit:visit_log_id(visit_date, treatment_name_text)",
    )
    .gt("nett_due", 0)
    .order("nett_due", { ascending: false });

  const rows = (data as unknown as OutstandingRow[]) ?? [];

  const totalOutstanding = rows.reduce((s, r) => s + Number(r.nett_due), 0);
  const overdue30 = rows.reduce(
    (s, r) => (OVERDUE.includes(r.age_bucket) ? s + Number(r.nett_due) : s),
    0,
  );
  const patientsWithBalance = new Set(rows.map((r) => r.patient_id)).size;

  // Prebuild per-row display + action data.
  const view = rows.map((r) => {
    const name = r.patient?.full_name ?? "Unknown";
    const number = r.patient?.whatsapp_number ?? null;
    const nettDue = Number(r.nett_due);
    const remindedWithin7 =
      !!r.payment_reminder_sent_at &&
      Date.now() - new Date(r.payment_reminder_sent_at).getTime() <
        SEVEN_DAYS_MS;
    const remindUrl = number
      ? waLink(
          number,
          `Namaste ${name} ji, yeh ek gentle reminder hai ki aapka ${formatINR(nettDue)} balance pending hai. Apni convenience se payment kar sakte hain. 🙏`,
        )
      : null;
    return { r, name, nettDue, remindedWithin7, remindUrl };
  });
  type BillingView = (typeof view)[number];

  // Group by age bucket, most overdue first (query already sorts each group by
  // highest balance). The section header carries the age band, so the per-row
  // Age badge is dropped as redundant.
  const AGE_ORDER: AgeBucket[] = [
    "days_90_plus",
    "days_60",
    "days_30",
    "current",
  ];
  const grouped = AGE_ORDER.map((bucket) => ({
    bucket,
    items: view.filter((v) => v.r.age_bucket === bucket),
  })).filter((g) => g.items.length > 0);

  const renderRow = ({
    r,
    name,
    nettDue,
    remindedWithin7,
    remindUrl,
  }: BillingView) => (
    <tr key={r.id} className="border-b border-border last:border-0">
      <td className="px-4 py-3">
        <Link
          href={`/patients/${r.patient_id}`}
          className="font-semibold text-primary hover:underline"
        >
          {name}
        </Link>
      </td>
      <td className="px-4 py-3 text-text-secondary">
        {formatDate(r.visit?.visit_date)}
      </td>
      <td className="px-4 py-3 text-text-secondary">
        {r.visit?.treatment_name_text ?? "—"}
      </td>
      <td className="px-4 py-3 text-right text-text-secondary">
        {formatINR(r.total_amount)}
      </td>
      <td className="px-4 py-3 text-right text-text-secondary">
        {formatINR(r.amount_paid)}
      </td>
      <td className="px-4 py-3 text-right font-bold text-danger">
        {formatINR(nettDue)}
      </td>
      <td className="px-4 py-3">
        <BillingRowActions
          row={{
            id: r.id,
            patientName: name,
            nettDue,
            remindUrl,
            reminded: remindedWithin7,
          }}
        />
      </td>
    </tr>
  );

  const renderCard = ({
    r,
    name,
    nettDue,
    remindedWithin7,
    remindUrl,
  }: BillingView) => (
    <div key={r.id} className="rounded-card border border-border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/patients/${r.patient_id}`}
          className="font-semibold text-primary hover:underline"
        >
          {name}
        </Link>
        <span className="font-bold text-danger">{formatINR(nettDue)}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
        <span>{formatDate(r.visit?.visit_date)}</span>
        <span>{r.visit?.treatment_name_text ?? "—"}</span>
      </div>
      <div className="mt-1 text-sm text-text-secondary">
        Total {formatINR(r.total_amount)} · Paid {formatINR(r.amount_paid)}
      </div>
      <div className="mt-3 border-t border-border pt-3">
        <BillingRowActions
          row={{
            id: r.id,
            patientName: name,
            nettDue,
            remindUrl,
            reminded: remindedWithin7,
          }}
        />
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Billing" />

      <StatGrid>
        <StatCard
          label="Total Outstanding"
          value={formatINR(totalOutstanding)}
          tone="danger"
        />
        <StatCard
          label="Overdue 30+ Days"
          value={formatINR(overdue30)}
          tone="warning"
        />
        <StatCard
          label="Patients with Balance"
          value={String(patientsWithBalance)}
        />
      </StatGrid>

      {view.length === 0 ? (
        <>
          <SectionHeader>Outstanding Balances</SectionHeader>
          <EmptyState>No outstanding balances. 🎉</EmptyState>
        </>
      ) : (
        grouped.map((g) => {
          const sum = g.items.reduce((s, v) => s + v.nettDue, 0);
          return (
            <div key={g.bucket}>
              <SectionHeader hint={`${formatINR(sum)} due`}>
                {AGE_BUCKET[g.bucket].label}
              </SectionHeader>

              {/* Desktop table */}
              <div className="hidden overflow-hidden rounded-card border border-border bg-white lg:block">
                <table className="w-full text-left text-[15px]">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                      <th className="px-4 py-3 font-medium">Patient</th>
                      <th className="px-4 py-3 font-medium">Visit</th>
                      <th className="px-4 py-3 font-medium">Treatment</th>
                      <th className="px-4 py-3 text-right font-medium">Total</th>
                      <th className="px-4 py-3 text-right font-medium">Paid</th>
                      <th className="px-4 py-3 text-right font-medium">Due</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>{g.items.map(renderRow)}</tbody>
                </table>
              </div>

              {/* Mobile / tablet cards */}
              <div className="space-y-3 lg:hidden">
                {g.items.map(renderCard)}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
