import Link from "next/link";
import { requireAdminContext } from "@/lib/admin/auth";
import { formatINR, formatDate } from "@/lib/format";

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

type SignupRow = {
  id: string;
  business_name: string | null;
  city: string | null;
  subscription_status: string | null;
  trial_ends_at: string | null;
  created_at: string;
  content_credits_balance: number | null;
};

function Card({
  label,
  value,
  accent = false,
  hint,
}: {
  label: string;
  value: string;
  accent?: boolean;
  hint?: string;
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
      {hint ? <p className="mt-1.5 text-xs text-text-secondary">{hint}</p> : null}
    </div>
  );
}

const STATUS_TINT: Record<string, string> = {
  trial: "bg-subtle text-text-secondary",
  active: "bg-[#4F46E5]/10 text-[#4F46E5]",
  past_due: "bg-warning/10 text-warning",
  deactivated: "bg-danger/10 text-danger",
  cancelled: "bg-danger/10 text-danger",
};

export default async function AdminOverviewPage() {
  // requireAdminContext re-verifies super-admin, THEN gives the service-role
  // client for these cross-tenant aggregates.
  const { db } = await requireAdminContext();

  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
  const in7days = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const now = new Date().toISOString();

  const [
    { data },
    { data: signups },
    { count: expiringTrials },
    { count: socialMonth },
    { count: premiumMonth },
    { count: audits30d },
  ] = await Promise.all([
    db.rpc("admin_overview_stats"),
    db
      .from("clinics")
      .select(
        "id, business_name, city, subscription_status, trial_ends_at, created_at, content_credits_balance",
      )
      .order("created_at", { ascending: false })
      .limit(8),
    // Trials ending within 7 days — the call-them-now list.
    db
      .from("clinics")
      .select("id", { count: "exact", head: true })
      .eq("subscription_status", "trial")
      .gte("trial_ends_at", now)
      .lte("trial_ends_at", in7days),
    db
      .from("social_posts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", monthStart),
    db
      .from("social_posts")
      .select("id", { count: "exact", head: true })
      .eq("premium_visual", true)
      .gte("created_at", monthStart),
    db
      .from("audit_runs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
  ]);

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

  // The three things the owner should act on today, worst first.
  const attention: { label: string; count: number; href: string }[] = [
    {
      label: "pending payment links to confirm",
      count: s.pending_links,
      href: "/admin/payments",
    },
    {
      label: "clinics past due — chase or they deactivate",
      count: s.past_due,
      href: "/admin/subscriptions",
    },
    {
      label: "trials ending within 7 days — call them",
      count: expiringTrials ?? 0,
      href: "/admin/subscriptions",
    },
  ].filter((a) => a.count > 0);

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
        Overview
      </h1>
      <p className="mt-2 text-[15px] text-text-secondary">
        Platform-wide totals across all clinics.
      </p>

      {/* Needs attention — actionable, worst first. Hidden when all clear. */}
      {attention.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-card border border-warning/40 bg-warning/5">
          {attention.map((a, i) => (
            <Link
              key={a.label}
              href={a.href}
              className={`flex min-h-[44px] items-center justify-between gap-3 px-4 py-3 hover:bg-warning/10 ${
                i > 0 ? "border-t border-warning/20" : ""
              }`}
            >
              <span className="text-[15px] text-text-primary">
                <span className="font-semibold">{a.count}</span> {a.label}
              </span>
              <span aria-hidden className="text-warning">
                →
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-card border border-border bg-white px-4 py-3 text-sm text-text-secondary">
          ✓ Nothing needs attention — no pending payments, no past-due
          clinics, no trials expiring this week.
        </p>
      )}

      {/* Headline numbers */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card label="Total clinics" value={String(s.total_clinics)} accent />
        <Card label="MRR" value={formatINR(s.mrr)} accent />
        <Card
          label="Revenue this month"
          value={formatINR(s.revenue_month)}
          accent
        />
        <Card label="Signups this week" value={String(s.signups_week)} accent />
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

      {/* Usage this month — the credit-burn signals behind the revenue. */}
      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
        Activity this month
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Card
          label="Content credits"
          value={String(s.content_consumed_month)}
          hint="consumed"
        />
        <Card
          label="Map credits"
          value={String(s.map_consumed_month)}
          hint="consumed"
        />
        <Card label="Social posts" value={String(socialMonth ?? 0)} />
        <Card
          label="✨ Premium visuals"
          value={String(premiumMonth ?? 0)}
          hint="the pack-upsell signal"
        />
        <Card
          label="Deep audits"
          value={String(audits30d ?? 0)}
          hint="last 30 days"
        />
      </div>

      {/* Recent signups — newest clinics with where they stand. */}
      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Recent signups
        </h2>
        <Link
          href="/admin/clinics"
          className="text-sm font-medium text-[#4F46E5] hover:underline"
        >
          All clinics →
        </Link>
      </div>
      <div className="mt-3 overflow-x-auto rounded-card border border-border bg-white shadow-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-[0.08em] text-text-secondary">
              <th className="px-4 py-3">Clinic</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Trial ends</th>
              <th className="px-4 py-3 text-right">Credits left</th>
              <th className="px-4 py-3">Joined</th>
            </tr>
          </thead>
          <tbody>
            {((signups as SignupRow[] | null) ?? []).map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/clinics/${c.id}`}
                    className="font-medium text-text-primary hover:text-[#4F46E5]"
                  >
                    {c.business_name ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-3 text-text-secondary">{c.city ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-pill px-2.5 py-0.5 text-xs font-medium ${
                      STATUS_TINT[c.subscription_status ?? ""] ??
                      "bg-subtle text-text-secondary"
                    }`}
                  >
                    {c.subscription_status ?? "—"}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {c.subscription_status === "trial" && c.trial_ends_at
                    ? formatDate(c.trial_ends_at)
                    : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  {c.content_credits_balance ?? 0}
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {formatDate(c.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
