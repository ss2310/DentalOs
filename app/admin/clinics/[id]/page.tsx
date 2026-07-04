import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/admin/auth";
import { formatDate, formatINR } from "@/lib/format";
import { FeatureFlagsEditor } from "./feature-flags";
import { AdminActions, type PlanChoice } from "./admin-actions";

export const dynamic = "force-dynamic";

type Clinic = {
  id: string;
  business_name: string | null;
  doctor_name: string | null;
  vertical: string | null;
  city: string | null;
  area: string | null;
  created_at: string;
  is_active: boolean;
  subscription_status: string | null;
  plan_id: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  last_payment_at: string | null;
  content_credits_balance: number | null;
  map_credits_balance: number | null;
  feature_flags: Record<string, unknown> | null;
};

type ClinicUser = {
  id: string;
  full_name: string | null;
  role: string;
  is_super_admin: boolean;
};

type LedgerRow = {
  id: string;
  created_at: string;
  kind: string;
  delta: number;
  reason: string;
  balance_after: number;
};

type EventRow = {
  id: string;
  created_at: string;
  event_type: string;
  amount_inr: number | string | null;
  note: string | null;
  status: string | null;
};

const REASON_LABELS: Record<string, string> = {
  trial_grant: "Trial grant",
  topup: "Top-up",
  generation: "Content generation",
  map_scan: "Map scan",
  admin_adjust: "Admin adjustment",
  monthly_reset: "Monthly reset",
  refund: "Refund",
};

function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key.replace(/_/g, " ");
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-white p-4">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-text-primary">
        {value}
      </p>
    </div>
  );
}

export default async function AdminClinicDetail({
  params,
}: {
  params: { id: string };
}) {
  const { db } = await requireAdminContext();

  const { data: clinicRow } = await db
    .from("clinics")
    .select(
      "id, business_name, doctor_name, vertical, city, area, created_at, is_active, subscription_status, plan_id, trial_ends_at, current_period_end, last_payment_at, content_credits_balance, map_credits_balance, feature_flags",
    )
    .eq("id", params.id)
    .maybeSingle();
  const clinic = clinicRow as Clinic | null;
  if (!clinic) notFound();

  const [
    { data: userRows },
    patients,
    appts,
    content,
    scans,
    { data: planRows },
    { data: ledgerRows },
    { data: eventRows },
  ] = await Promise.all([
    db
      .from("profiles")
      .select("id, full_name, role, is_super_admin")
      .eq("home_clinic_id", clinic.id)
      .order("role", { ascending: true }),
    db.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id),
    db.from("appointments").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id),
    db.from("generated_content").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id),
    db.from("rank_scans").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id),
    db
      .from("plans")
      .select("id, name, price_inr, content_credits, map_credits, billing_period")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    db
      .from("credit_ledger")
      .select("id, created_at, kind, delta, reason, balance_after")
      .eq("clinic_id", clinic.id)
      .order("created_at", { ascending: false })
      .limit(30),
    db
      .from("billing_events")
      .select("id, created_at, event_type, amount_inr, note, status")
      .eq("clinic_id", clinic.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const users = (userRows as ClinicUser[] | null) ?? [];
  const plans = (planRows as PlanChoice[] | null) ?? [];
  const ledger = (ledgerRows as LedgerRow[] | null) ?? [];
  const events = (eventRows as EventRow[] | null) ?? [];
  const planName = plans.find((p) => p.id === clinic.plan_id)?.name ?? "—";

  const renewalDate =
    clinic.subscription_status === "trial" || clinic.subscription_status === "past_due"
      ? clinic.trial_ends_at
      : clinic.current_period_end;
  const renewalOverdue = renewalDate
    ? new Date(renewalDate).getTime() < Date.now()
    : false;

  return (
    <div>
      <Link
        href="/admin/clinics"
        className="text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        ← Clinics
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
            {clinic.business_name ?? "Unnamed clinic"}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            <span className="capitalize">{clinic.vertical ?? "—"}</span>
            {clinic.city || clinic.area
              ? ` · ${[clinic.area, clinic.city].filter(Boolean).join(", ")}`
              : ""}{" "}
            · Joined {formatDate(clinic.created_at)}
          </p>
        </div>
        <span className="rounded-pill bg-[#4F46E5]/10 px-2.5 py-1 text-xs font-medium capitalize text-[#4F46E5]">
          {(clinic.subscription_status ?? "—").replace("_", " ")}
        </span>
      </div>

      {/* Key stats */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Users" value={String(users.length)} />
        <Stat label="Patients" value={String(patients.count ?? 0)} />
        <Stat label="Appointments" value={String(appts.count ?? 0)} />
        <Stat label="Content" value={String(content.count ?? 0)} />
        <Stat label="Scans" value={String(scans.count ?? 0)} />
        <Stat
          label="Credits (content/map)"
          value={`${clinic.content_credits_balance ?? 0}/${clinic.map_credits_balance ?? 0}`}
        />
      </div>

      {/* Subscription */}
      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
        Subscription
      </h2>
      <div className="grid grid-cols-2 gap-4 rounded-card border border-border bg-white p-5 sm:grid-cols-4">
        <div>
          <p className="text-sm text-text-secondary">Plan</p>
          <p className="mt-0.5 font-medium text-text-primary">{planName}</p>
        </div>
        <div>
          <p className="text-sm text-text-secondary">Status</p>
          <p className="mt-0.5 font-medium capitalize text-text-primary">
            {(clinic.subscription_status ?? "—").replace("_", " ")}
          </p>
        </div>
        <div>
          <p className="text-sm text-text-secondary">
            {clinic.subscription_status === "active" ? "Renews" : "Trial ends"}
          </p>
          <p
            className={`mt-0.5 font-medium ${renewalOverdue ? "text-danger" : "text-text-primary"}`}
          >
            {renewalDate ? formatDate(renewalDate) : "—"}
          </p>
        </div>
        <div>
          <p className="text-sm text-text-secondary">Last payment</p>
          <p className="mt-0.5 font-medium text-text-primary">
            {clinic.last_payment_at ? formatDate(clinic.last_payment_at) : "—"}
          </p>
        </div>
      </div>

      {/* Admin actions */}
      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
        Admin actions
      </h2>
      <AdminActions
        clinicId={clinic.id}
        isActive={clinic.is_active}
        currentPlanId={clinic.plan_id}
        plans={plans}
      />

      {/* Credit history */}
      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
        Credit history
      </h2>
      {ledger.length === 0 ? (
        <p className="rounded-card border border-border bg-white p-6 text-center text-sm text-text-secondary">
          No credit activity.
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-white">
          {ledger.map((r) => {
            const positive = r.delta >= 0;
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {label(REASON_LABELS, r.reason)}
                    <span className="ml-2 rounded-pill bg-subtle px-2 py-0.5 text-xs font-normal text-text-secondary capitalize">
                      {r.kind}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {formatDate(r.created_at)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`text-sm font-semibold ${positive ? "text-success" : "text-text-primary"}`}
                  >
                    {positive ? "+" : ""}
                    {r.delta}
                  </p>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    bal {r.balance_after}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Billing events */}
      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
        Billing events
      </h2>
      {events.length === 0 ? (
        <p className="rounded-card border border-border bg-white p-6 text-center text-sm text-text-secondary">
          No billing events.
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-white">
          {events.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium capitalize text-text-primary">
                  {e.event_type.replace(/_/g, " ")}
                  {e.status === "pending" ? (
                    <span className="ml-2 rounded-pill bg-warning/10 px-2 py-0.5 text-xs font-normal text-warning">
                      pending
                    </span>
                  ) : null}
                </p>
                {e.note ? (
                  <p className="mt-0.5 truncate text-xs text-text-secondary">{e.note}</p>
                ) : null}
                <p className="mt-0.5 text-xs text-text-secondary">
                  {formatDate(e.created_at)}
                </p>
              </div>
              {e.amount_inr != null ? (
                <span className="shrink-0 text-sm font-medium text-text-primary">
                  {formatINR(e.amount_inr)}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Users */}
      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
        Users
      </h2>
      <div className="overflow-hidden rounded-card border border-border bg-white">
        {users.length === 0 ? (
          <p className="p-6 text-center text-sm text-text-secondary">
            No users in this clinic.
          </p>
        ) : (
          users.map((u, i) => (
            <div
              key={u.id}
              className={`flex items-center justify-between gap-3 px-4 py-3 ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              <span className="text-[15px] text-text-primary">
                {u.full_name || "—"}
              </span>
              <span className="flex items-center gap-2">
                {u.is_super_admin ? (
                  <span className="rounded-pill bg-[#4F46E5]/10 px-2 py-0.5 text-xs font-medium text-[#4F46E5]">
                    super admin
                  </span>
                ) : null}
                <span className="text-sm capitalize text-text-secondary">
                  {u.role.replace("_", " ")}
                </span>
              </span>
            </div>
          ))
        )}
      </div>

      {/* Feature flags */}
      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
        Feature flags
      </h2>
      <FeatureFlagsEditor clinicId={clinic.id} flags={clinic.feature_flags} />
    </div>
  );
}
