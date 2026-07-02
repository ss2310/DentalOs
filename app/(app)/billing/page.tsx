import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatINR, formatDate } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { AGE_BUCKET, type AgeBucket } from "@/lib/age-bucket";
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

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-card border border-border bg-white p-5">
      <p className="text-sm text-text-secondary">{label}</p>
      <p
        className="mt-1 text-2xl font-semibold text-text-primary"
        style={color ? { color } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

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

  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Billing</h1>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Outstanding"
          value={formatINR(totalOutstanding)}
          color="#DC2626"
        />
        <StatCard
          label="Overdue 30+ Days"
          value={formatINR(overdue30)}
          color="#D97706"
        />
        <StatCard
          label="Patients with Balance"
          value={String(patientsWithBalance)}
        />
      </div>

      {view.length === 0 ? (
        <div className="mt-6 rounded-card border border-border bg-white p-10 text-center">
          <p className="text-[15px] text-text-secondary">
            No outstanding balances. 🎉
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-6 hidden overflow-hidden rounded-card border border-border bg-white lg:block">
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Visit</th>
                  <th className="px-4 py-3 font-medium">Treatment</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">Paid</th>
                  <th className="px-4 py-3 text-right font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Age</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {view.map(({ r, name, nettDue, remindedWithin7, remindUrl }) => {
                  const age = AGE_BUCKET[r.age_bucket];
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-border last:border-0"
                    >
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
                        <span
                          className={`rounded-pill px-2.5 py-1 text-xs font-medium ${age.badge}`}
                        >
                          {age.label}
                        </span>
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
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile / tablet cards */}
          <div className="mt-6 space-y-3 lg:hidden">
            {view.map(({ r, name, nettDue, remindedWithin7, remindUrl }) => {
              const age = AGE_BUCKET[r.age_bucket];
              return (
                <div
                  key={r.id}
                  className="rounded-card border border-border bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/patients/${r.patient_id}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {name}
                    </Link>
                    <span className="font-bold text-danger">
                      {formatINR(nettDue)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
                    <span>{formatDate(r.visit?.visit_date)}</span>
                    <span>{r.visit?.treatment_name_text ?? "—"}</span>
                    <span
                      className={`rounded-pill px-2 py-0.5 text-xs font-medium ${age.badge}`}
                    >
                      {age.label}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-text-secondary">
                    Total {formatINR(r.total_amount)} · Paid{" "}
                    {formatINR(r.amount_paid)}
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
            })}
          </div>
        </>
      )}
    </div>
  );
}
