"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate, formatINR } from "@/lib/format";
import { PageHeader, StatGrid, StatCard, SectionHeader, EmptyState } from "@/components/page";
import { ReceiptActions } from "@/components/receipt-actions";

export type DaysheetVisit = {
  id: string;
  visit_date: string;
  treatment_name_text: string | null;
  doctor: string | null;
  cost: string;
  amount_paid: string;
  outstanding_amount: string;
  payment_status: "paid" | "partial" | "pending";
  patient: { id: string; full_name: string } | null;
};

export type DaysheetPayment = {
  id: string;
  amount: string;
  payment_mode: string;
  payment_date: string;
  receipt_no: string | null;
  patient: { id: string; full_name: string; whatsapp_number: string | null } | null;
  visit: { treatment_name_text: string | null } | null;
};

const PAYMENT_BADGE: Record<DaysheetVisit["payment_status"], string> = {
  paid: "bg-success/10 text-success",
  partial: "bg-warning/10 text-warning",
  pending: "bg-danger/10 text-danger",
};

const MODE_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  insurance: "Insurance",
};

export function DaysheetClient({
  date,
  today,
  visits,
  payments,
  clinicName,
}: {
  date: string;
  today: string;
  visits: DaysheetVisit[];
  payments: DaysheetPayment[];
  clinicName: string;
}) {
  const router = useRouter();
  const [doctor, setDoctor] = useState("");

  const doctors = useMemo(() => {
    const set = new Set<string>();
    for (const v of visits) if (v.doctor) set.add(v.doctor);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [visits]);

  const shownVisits = doctor ? visits.filter((v) => v.doctor === doctor) : visits;

  // Production = charged today; Collection = received today (incl. old dues).
  const production = shownVisits.reduce((s, v) => s + (Number(v.cost) || 0), 0);
  const outstandingAdded = shownVisits.reduce(
    (s, v) => s + (Number(v.outstanding_amount) || 0),
    0,
  );
  // Payments aren't doctor-attributed, so Collection ignores the doctor filter.
  const collection = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const byMode = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.payment_mode] = (acc[p.payment_mode] ?? 0) + (Number(p.amount) || 0);
    return acc;
  }, {});

  return (
    <div>
      <PageHeader
        title="Daysheet"
        subtitle={`The day's register — every visit and every rupee received on ${formatDate(date)}.`}
      />

      {/* Date + doctor filter */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) =>
            e.target.value && router.push(`/daysheet?date=${e.target.value}`)
          }
          aria-label="Pick a date"
          className={`h-11 rounded-button border px-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
            date !== today ? "border-primary text-primary" : "border-border text-text-primary"
          }`}
        />
        {date !== today ? (
          <button
            type="button"
            onClick={() => router.push("/daysheet")}
            className="flex h-11 items-center rounded-button px-3 text-sm font-medium text-primary hover:underline"
          >
            Today
          </button>
        ) : null}
        {doctors.length > 1 ? (
          <select
            value={doctor}
            onChange={(e) => setDoctor(e.target.value)}
            aria-label="Filter by doctor"
            className="h-11 rounded-button border border-border bg-white px-3 text-sm font-medium text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">All doctors</option>
            {doctors.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <StatGrid cols={4}>
        <StatCard label="Visits" value={String(shownVisits.length)} />
        <StatCard
          label="Production"
          value={formatINR(production)}
          hint="Work charged today"
        />
        <StatCard
          label="Collection"
          value={formatINR(collection)}
          hint="Received today, incl. old dues"
          hero
        />
        <StatCard
          label="Outstanding added"
          value={formatINR(outstandingAdded)}
          tone={outstandingAdded > 0 ? "danger" : "default"}
        />
      </StatGrid>

      {/* Visits register */}
      <SectionHeader hint="In order of entry">Visits</SectionHeader>
      {shownVisits.length === 0 ? (
        <EmptyState>
          No visits on {formatDate(date)}. Log one from an appointment, or use
          + Add Treatment on a patient&apos;s profile for walk-ins.
        </EmptyState>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-card border border-border bg-white md:block">
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Treatment</th>
                  <th className="px-4 py-3 font-medium">Doctor</th>
                  <th className="px-4 py-3 text-right font-medium">Fees</th>
                  <th className="px-4 py-3 text-right font-medium">Paid</th>
                  <th className="px-4 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {shownVisits.map((v) => (
                  <tr key={v.id} className="border-b border-border last:border-0 hover:bg-subtle">
                    <td className="px-4 py-3">
                      {v.patient ? (
                        <Link
                          href={`/patients/${v.patient.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {v.patient.full_name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-primary">
                      {v.treatment_name_text ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{v.doctor ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-text-primary">
                      {formatINR(v.cost)}
                    </td>
                    <td className="px-4 py-3 text-right text-text-primary">
                      {formatINR(v.amount_paid)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`rounded-pill px-2.5 py-1 text-xs font-medium capitalize ${PAYMENT_BADGE[v.payment_status]}`}
                      >
                        {v.payment_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {shownVisits.map((v) => (
              <div key={v.id} className="rounded-card border border-border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  {v.patient ? (
                    <Link
                      href={`/patients/${v.patient.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {v.patient.full_name}
                    </Link>
                  ) : (
                    <span>—</span>
                  )}
                  <span
                    className={`rounded-pill px-2.5 py-1 text-xs font-medium capitalize ${PAYMENT_BADGE[v.payment_status]}`}
                  >
                    {v.payment_status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-text-secondary">
                  {v.treatment_name_text ?? "—"}
                  {v.doctor ? ` · ${v.doctor}` : ""}
                </p>
                <div className="mt-2 flex gap-4 text-sm text-text-secondary">
                  <span>Fees: {formatINR(v.cost)}</span>
                  <span>Paid: {formatINR(v.amount_paid)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Payments register */}
      <SectionHeader
        hint={
          collection > 0
            ? Object.entries(byMode)
                .map(([m, amt]) => `${MODE_LABEL[m] ?? m} ${formatINR(amt)}`)
                .join(" · ")
            : undefined
        }
      >
        Payments received
      </SectionHeader>
      {payments.length === 0 ? (
        <EmptyState>
          No payments received on {formatDate(date)}. Money collected at a
          visit or via Record Payment lands here with a receipt number.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <div key={p.id} className="rounded-card border border-border bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  {p.patient ? (
                    <Link
                      href={`/patients/${p.patient.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {p.patient.full_name}
                    </Link>
                  ) : (
                    <span className="font-medium text-text-primary">—</span>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
                    {p.receipt_no ? <span>{p.receipt_no}</span> : null}
                    <span className="rounded-pill bg-subtle px-2 py-0.5 text-xs font-medium">
                      {MODE_LABEL[p.payment_mode] ?? p.payment_mode}
                    </span>
                    {p.visit?.treatment_name_text ? (
                      <span>· {p.visit.treatment_name_text}</span>
                    ) : null}
                  </div>
                </div>
                <span className="text-[17px] font-semibold text-success">
                  {formatINR(p.amount)}
                </span>
              </div>
              <div className="mt-3 border-t border-border pt-3">
                <ReceiptActions
                  paymentId={p.id}
                  receiptNo={p.receipt_no}
                  amount={Number(p.amount) || 0}
                  paymentDate={p.payment_date}
                  patientName={p.patient?.full_name ?? "Patient"}
                  patientWhatsapp={p.patient?.whatsapp_number ?? null}
                  clinicName={clinicName}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
