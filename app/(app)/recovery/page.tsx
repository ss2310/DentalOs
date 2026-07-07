import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/roles";
import { formatINR, formatDate, nowIST } from "@/lib/format";
import {
  RECOVERY_TYPE,
  RECOVERY_OUTCOME,
  POSITIVE_OUTCOMES,
  type RecoveryType,
  type RecoveryOutcome,
} from "@/lib/recovery-badges";
import {
  PageHeader,
  StatGrid,
  StatCard,
  SectionHeader,
  EmptyState,
} from "@/components/page";

export const dynamic = "force-dynamic";

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// The four "converted" pairings surfaced as breakdown cards (this month).
const BREAKDOWN: {
  label: string;
  type: RecoveryType;
  outcome: RecoveryOutcome;
}[] = [
  { label: "No-Shows Rebooked", type: "no_show", outcome: "rebooked" },
  { label: "Deferred Converted", type: "deferred_treatment", outcome: "accepted" },
  { label: "Recalls Returned", type: "recall_overdue", outcome: "returned" },
  { label: "Outstanding Collected", type: "outstanding_payment", outcome: "paid" },
];

type PosEvent = {
  recovery_type: RecoveryType;
  outcome: RecoveryOutcome;
  outcome_date: string | null;
  revenue_recovered: string;
};

type AuditEvent = {
  id: string;
  recovery_type: RecoveryType;
  outcome: RecoveryOutcome | null;
  outcome_date: string | null;
  created_at: string;
  revenue_recovered: string;
  patient: { full_name: string } | null;
};

export default async function RecoveryPage() {
  await requireAdmin();
  const supabase = createClient();
  const { date: today } = nowIST();
  const thisMonthKey = today.slice(0, 7);

  // Six month buckets, oldest first, using UTC math to avoid tz drift.
  const [ty, tm] = today.split("-").map(Number);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(ty, tm - 1 - (5 - i), 1));
    return {
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      label: MONTH_ABBR[d.getUTCMonth()],
    };
  });
  const sixMonthsStart = `${months[0].key}-01`;

  const [posRes, auditRes] = await Promise.all([
    supabase
      .from("recovery_events")
      .select("recovery_type, outcome, outcome_date, revenue_recovered")
      .in("outcome", POSITIVE_OUTCOMES)
      .gte("outcome_date", sixMonthsStart),
    supabase
      .from("recovery_events")
      .select(
        "id, recovery_type, outcome, outcome_date, created_at, revenue_recovered, patient:patient_id(full_name)",
      )
      .not("outcome", "is", null)
      .order("outcome_date", { ascending: false, nullsFirst: false })
      .limit(15),
  ]);

  const posEvents = (posRes.data as unknown as PosEvent[]) ?? [];
  const audit = (auditRes.data as unknown as AuditEvent[]) ?? [];

  const thisMonth = posEvents.filter(
    (e) => (e.outcome_date ?? "").slice(0, 7) === thisMonthKey,
  );
  const recoveredMonth = thisMonth.reduce(
    (s, e) => s + Number(e.revenue_recovered),
    0,
  );

  const breakdown = BREAKDOWN.map((b) => {
    const matches = thisMonth.filter(
      (e) => e.recovery_type === b.type && e.outcome === b.outcome,
    );
    return {
      ...b,
      sum: matches.reduce((s, e) => s + Number(e.revenue_recovered), 0),
      count: matches.length,
    };
  });

  const chart = months.map((m) => ({
    label: m.label,
    value: posEvents
      .filter((e) => (e.outcome_date ?? "").slice(0, 7) === m.key)
      .reduce((s, e) => s + Number(e.revenue_recovered), 0),
  }));
  const chartMax = Math.max(1, ...chart.map((c) => c.value));

  return (
    <div>
      <PageHeader title="Revenue Recovered" />

      {/* Hero */}
      <div className="mt-5 rounded-card border border-border bg-white p-6">
        <p className="text-sm uppercase tracking-wide text-text-secondary">
          Recovered This Month
        </p>
        <p
          className="mt-1 font-semibold"
          style={{ fontSize: "36px", lineHeight: 1.1, color: "#059669" }}
        >
          {formatINR(recoveredMonth)}
        </p>
      </div>

      {/* Breakdown cards */}
      <StatGrid cols={4}>
        {breakdown.map((b) => (
          <StatCard
            key={b.label}
            label={b.label}
            value={formatINR(b.sum)}
            hint={`${b.count} ${b.count === 1 ? "patient" : "patients"}`}
            tone="success"
          />
        ))}
      </StatGrid>

      {/* 6-month bar chart */}
      <SectionHeader>Last 6 Months</SectionHeader>
      <div className="rounded-card border border-border bg-white p-5">
        {chart.every((c) => c.value === 0) ? (
          <p className="py-8 text-center text-sm text-text-secondary">
            No recovery recorded in the last 6 months yet.
          </p>
        ) : (
          <div className="flex h-48 items-end justify-between gap-3">
            {chart.map((c) => (
              <div key={c.label} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-medium text-text-primary">
                  {c.value > 0 ? formatINR(c.value) : ""}
                </span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-success"
                    style={{
                      height: `${Math.max((c.value / chartMax) * 100, c.value > 0 ? 4 : 0)}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-text-secondary">{c.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audit trail */}
      <SectionHeader hint="Most recent outcome first">
        Recovery Audit Trail
      </SectionHeader>
      <div>
        {audit.length === 0 ? (
          <EmptyState>No recovery outcomes recorded yet.</EmptyState>
        ) : (
          <div className="space-y-3">
            {audit.map((e) => {
              const type = RECOVERY_TYPE[e.recovery_type];
              const outcome = e.outcome ? RECOVERY_OUTCOME[e.outcome] : null;
              const recovered = Number(e.revenue_recovered);
              return (
                <div
                  key={e.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border bg-white p-4"
                >
                  <span className="w-24 shrink-0 text-sm text-text-secondary">
                    {formatDate(e.outcome_date ?? e.created_at)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-text-primary">
                    {e.patient?.full_name ?? "Unknown"}
                  </span>
                  <span
                    className={`rounded-pill px-2.5 py-1 text-xs font-medium ${type.badge}`}
                  >
                    {type.label}
                  </span>
                  {outcome ? (
                    <span
                      className={`rounded-pill px-2.5 py-1 text-xs font-medium ${outcome.badge}`}
                    >
                      {outcome.label}
                    </span>
                  ) : null}
                  <span
                    className="w-24 shrink-0 text-right text-[15px] font-semibold"
                    style={{ color: recovered > 0 ? "#059669" : "#6B7280" }}
                  >
                    {recovered > 0 ? formatINR(recovered) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-6 text-sm text-text-secondary">
        Recovery outcomes are recorded as you rebook no-shows, convert deferred
        cases, and collect balances across{" "}
        <Link href="/pipeline" className="text-primary hover:underline">
          Pipeline
        </Link>
        ,{" "}
        <Link href="/billing" className="text-primary hover:underline">
          Billing
        </Link>
        , and{" "}
        <Link href="/appointments" className="text-primary hover:underline">
          Appointments
        </Link>
        .
      </p>
    </div>
  );
}
