// Subscription plan tiers + their limits. Kept deliberately small: one coarse
// tier per clinic (clinics.plan, migration 011), mapped to feature caps here.
// This is NOT a billing system — tiers are set manually for now (like
// profiles.is_agency). Add more per-plan limits here as features need them.

export const PLANS = ["free", "starter", "pro", "agency"] as const;
export type Plan = (typeof PLANS)[number];

// Max hosted landing pages a clinic may publish, by plan. Hosting static HTML is
// cheap; the cap exists to discourage thin doorway-page spam, not to save infra.
const LANDING_PAGE_LIMIT: Record<Plan, number> = {
  free: 1,
  starter: 5,
  pro: 25,
  agency: 200,
};

function normalizePlan(plan: string | null | undefined): Plan {
  return (PLANS as readonly string[]).includes(plan ?? "")
    ? (plan as Plan)
    : "starter";
}

/** Human label for a plan, e.g. "Starter". */
export function planLabel(plan: string | null | undefined): string {
  const p = normalizePlan(plan);
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** How many hosted landing pages this plan may publish. */
export function landingPageLimit(plan: string | null | undefined): number {
  return LANDING_PAGE_LIMIT[normalizePlan(plan)];
}
