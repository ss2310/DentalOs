import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatGrid, StatCard } from "@/components/page";
import { formatDate } from "@/lib/format";
import {
  effectiveStatus,
  statusLabel,
  trialDaysLeft,
} from "@/lib/subscription";
import {
  UpgradeOptions,
  type PlanOption,
  type PackOption,
} from "./upgrade-client";

export const dynamic = "force-dynamic";

export default async function UpgradePage() {
  const supabase = createClient();

  const { data: clinic } = await supabase
    .from("clinics")
    .select(
      "subscription_status, trial_ends_at, current_period_end, content_credits_balance, map_credits_balance, plan_id",
    )
    .single();

  const [{ data: plans }, { data: packs }] = await Promise.all([
    supabase
      .from("plans")
      .select("id, name, price_inr, content_credits, map_credits, billing_period")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("credit_packs")
      .select("id, name, price_inr, content_credits, map_credits")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const eff = effectiveStatus(
    clinic?.subscription_status,
    clinic?.trial_ends_at,
  );
  const days = trialDaysLeft(clinic?.trial_ends_at);
  const currentPlan =
    (plans as PlanOption[] | null)?.find((p) => p.id === clinic?.plan_id) ??
    null;

  // One-line context under the status, tailored to where the clinic is.
  let statusHint = "";
  if (eff === "trial") {
    statusHint =
      days > 0
        ? `${days} day${days === 1 ? "" : "s"} left in your free trial`
        : "Your free trial ends today";
  } else if (eff === "past_due") {
    statusHint = "Your trial has ended — upgrade to keep your account active";
  } else if (eff === "active") {
    statusHint = clinic?.current_period_end
      ? `Renews on ${formatDate(clinic.current_period_end)}`
      : "Your plan is active";
  } else {
    statusHint = "Your account is inactive — upgrade to restore access";
  }

  return (
    <div>
      <PageHeader
        title="Upgrade"
        subtitle="Manage your plan and credit balances."
      />

      <div className="mt-5 rounded-card border border-border bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text-secondary">
              Current plan
            </p>
            <p className="mt-0.5 text-[17px] font-semibold text-text-primary">
              {currentPlan?.name ?? "No active plan"}
            </p>
          </div>
          <span className="rounded-pill bg-subtle px-3 py-1 text-sm font-medium text-text-primary">
            {statusLabel(eff)}
          </span>
        </div>
        <p className="mt-2 text-sm text-text-secondary">{statusHint}</p>
      </div>

      <StatGrid cols={2}>
        <StatCard
          hero
          label="Content credits"
          value={String(clinic?.content_credits_balance ?? 0)}
          hint="AI content, insights & landing pages"
        />
        <StatCard
          label="Map-scan credits"
          value={String(clinic?.map_credits_balance ?? 0)}
          hint="Map rank scans & prospect audits"
        />
      </StatGrid>

      <UpgradeOptions
        plans={(plans as PlanOption[] | null) ?? []}
        packs={(packs as PackOption[] | null) ?? []}
        currentPlanId={clinic?.plan_id ?? null}
      />
    </div>
  );
}
