import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/roles";
import { SettingsTabs } from "./settings-tabs";
import type { StaffMember } from "./staff-manager";
import type { Clinic } from "./clinic-info-form";
import type { RateCard } from "./rate-card-manager";
import type { LandingPageRow } from "./landing-pages-manager";
import type { BillingInfo, LedgerRow } from "./billing-tab";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: clinic },
    { data: cards },
    { data: pages },
    { data: staffRows },
    { data: sub },
    { data: ledger },
  ] = await Promise.all([
      supabase
        .from("clinics")
        .select(
          "business_name, doctor_name, phone, address, city, area, google_review_url, instagram_handle, website_url, upi_id, booking_slug, default_lat, default_lng",
        )
        .single(),
      supabase
        .from("rate_cards")
        .select(
          "id, treatment_name, category, base_price, duration_mins, recall_interval_days, is_active",
        )
        .order("is_active", { ascending: false })
        .order("treatment_name", { ascending: true }),
      supabase
        .from("landing_pages")
        .select(
          "id, slug, target_area, title, status, published_at, html_content",
        )
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, full_name, role")
        .order("role", { ascending: true })
        .order("full_name", { ascending: true }),
      supabase
        .from("clinics")
        .select(
          "subscription_status, plan_id, trial_ends_at, current_period_end, content_credits_balance, map_credits_balance",
        )
        .single(),
      supabase
        .from("credit_ledger")
        .select("id, created_at, kind, delta, reason, balance_after")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  const clinicData = (clinic as (Clinic & { booking_slug: string | null }) | null) ?? null;

  // Resolve the current plan's display name (may be the seeded Free Trial).
  let planName: string | null = null;
  if (sub?.plan_id) {
    const { data: planRow } = await supabase
      .from("plans")
      .select("name")
      .eq("id", sub.plan_id)
      .maybeSingle();
    planName = planRow?.name ?? null;
  }

  const billing: BillingInfo = {
    subscriptionStatus: sub?.subscription_status ?? null,
    planName,
    trialEndsAt: sub?.trial_ends_at ?? null,
    currentPeriodEnd: sub?.current_period_end ?? null,
    contentBalance: sub?.content_credits_balance ?? 0,
    mapBalance: sub?.map_credits_balance ?? 0,
    ledger: (ledger as LedgerRow[] | null) ?? [],
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
      <div className="mt-6">
        <SettingsTabs
          clinic={(clinicData as Clinic) ?? ({} as Clinic)}
          rateCards={(cards as RateCard[]) ?? []}
          landingPages={(pages as LandingPageRow[]) ?? []}
          bookingSlug={clinicData?.booking_slug ?? null}
          staff={(staffRows as StaffMember[]) ?? []}
          currentUserId={user?.id ?? ""}
          billing={billing}
        />
      </div>
    </div>
  );
}
