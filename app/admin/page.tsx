import { requireAdminContext } from "@/lib/admin/auth";
import { formatINR } from "@/lib/format";

export const dynamic = "force-dynamic";

type Stats = {
  total_clinics: number;
  trial: number;
  active: number;
  past_due: number;
  deactivated: number;
  mrr: number | string;
  content_consumed_month: number;
  map_consumed_month: number;
  signups_week: number;
  revenue_month: number | string;
  pending_links: number;
};

function Card({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-card border border-border bg-white p-5 shadow-card">
      <p className="text-sm font-medium text-text-secondary">{label}</p>
      <p
        className={`mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.02em] ${
          accent ? "text-[#4F46E5]" : "text-text-primary"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default async function AdminOverviewPage() {
  // requireAdminContext re-verifies super-admin, THEN gives the service-role
  // client for these cross-tenant aggregates.
  const { db } = await requireAdminContext();
  const { data } = await db.rpc("admin_overview_stats");
  const s = (data as Stats | null) ?? {
    total_clinics: 0,
    trial: 0,
    active: 0,
    past_due: 0,
    deactivated: 0,
    mrr: 0,
    content_consumed_month: 0,
    map_consumed_month: 0,
    signups_week: 0,
    revenue_month: 0,
    pending_links: 0,
  };

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
        Overview
      </h1>
      <p className="mt-2 text-[15px] text-text-secondary">
        Platform-wide totals across all clinics.
      </p>

      {/* Headline numbers */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3">
        <Card label="Total clinics" value={String(s.total_clinics)} accent />
        <Card label="MRR" value={formatINR(s.mrr)} accent />
        <Card label="Signups this week" value={String(s.signups_week)} accent />
      </div>

      {/* Payments */}
      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
        Payments
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <Card label="Revenue this month" value={formatINR(s.revenue_month)} accent />
        <Card label="Pending payment links" value={String(s.pending_links)} />
      </div>

      {/* Subscription status breakdown */}
      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
        Subscription status
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card label="Trial" value={String(s.trial)} />
        <Card label="Active" value={String(s.active)} />
        <Card label="Past due" value={String(s.past_due)} />
        <Card label="Deactivated" value={String(s.deactivated)} />
      </div>

      {/* Credit consumption this month */}
      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
        Credits consumed this month
      </h2>
      <div className="grid grid-cols-2 gap-4">
        <Card label="Content credits" value={String(s.content_consumed_month)} />
        <Card label="Map credits" value={String(s.map_consumed_month)} />
      </div>
    </div>
  );
}
