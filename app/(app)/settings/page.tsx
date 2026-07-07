import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/roles";
import { flagOn } from "@/lib/admin/feature-flags";
import {
  voiceNotesGloballyEnabled,
  voiceNotesDailyCap,
} from "@/lib/voice-notes-access";
import { multiVerticalEnabled } from "@/lib/multi-vertical-access";
import { SettingsTabs } from "./settings-tabs";
import type { StaffMember } from "./staff-manager";
import type { Clinic } from "./clinic-info-form";
import type { RateCard } from "./rate-card-manager";
import type { LandingPageRow } from "./landing-pages-manager";
import type { BillingInfo, LedgerRow } from "./billing-tab";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: { setup?: string };
}) {
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
    { data: kitRow },
  ] = await Promise.all([
      supabase
        .from("clinics")
        .select(
          "business_name, doctor_name, phone, address, city, area, google_review_url, instagram_handle, website_url, upi_id, booking_slug, default_lat, default_lng, feature_flags",
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
      supabase
        .from("clinic_brand_kits")
        .select("logo_path, primary_color, secondary_color, font")
        .maybeSingle(),
    ]);

  // Logo preview for the Settings brand card (bucket is private; the select
  // policy is clinic-scoped, so the session client can sign its own logo).
  let logoUrl: string | null = null;
  if (kitRow?.logo_path) {
    const { data: signed } = await supabase.storage
      .from("brand-assets")
      .createSignedUrl(kitRow.logo_path, 3600);
    logoUrl = signed?.signedUrl ?? null;
  }
  const brandKit = {
    primary_color: kitRow?.primary_color ?? "#0D9488",
    secondary_color: kitRow?.secondary_color ?? "#1D1D1F",
    font: kitRow?.font ?? "inter",
    hasLogo: !!kitRow?.logo_path,
  };

  const clinicData = (clinic as (Clinic & { booking_slug: string | null }) | null) ?? null;

  const voiceNotesInfo = {
    enabled: flagOn(
      (clinic as { feature_flags?: Record<string, unknown> } | null)
        ?.feature_flags,
      "voice_notes",
    ),
    globalEnabled: voiceNotesGloballyEnabled(),
    dailyCap: voiceNotesDailyCap(),
  };

  // Multi-vertical picker — only fetched/shown when the flag is on, so production
  // (flag off) issues no extra queries and renders no vertical UI. Kept in a
  // separate query from the main clinic select so it can never disturb the
  // existing Clinic Info form.
  let verticalInfo = {
    enabled: false,
    current: "dental",
    options: [] as { id: string; display_name: string }[],
  };
  if (multiVerticalEnabled()) {
    const [vRow, vOpts] = await Promise.all([
      supabase.from("clinics").select("vertical").single(),
      supabase
        .from("verticals")
        .select("id, display_name")
        .eq("is_active", true)
        .order("display_name", { ascending: true }),
    ]);
    verticalInfo = {
      enabled: true,
      current:
        (vRow.data as { vertical?: string | null } | null)?.vertical ?? "dental",
      options:
        (vOpts.data as { id: string; display_name: string }[] | null) ?? [],
    };
  }

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
      {searchParams?.setup === "1" ? (
        <div className="mt-4 max-w-2xl rounded-card border border-primary/30 bg-primary/5 p-4">
          <p className="text-[15px] font-semibold text-text-primary">
            Finish setting up your clinic
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Fill in the required fields below (marked{" "}
            <span className="text-danger">*</span>) and save — everything from
            AI content to WhatsApp messages is built from these details. You
            can change them any time.
          </p>
        </div>
      ) : null}
      <div className="mt-6">
        <SettingsTabs
          clinic={(clinicData as Clinic) ?? ({} as Clinic)}
          rateCards={(cards as RateCard[]) ?? []}
          landingPages={(pages as LandingPageRow[]) ?? []}
          bookingSlug={clinicData?.booking_slug ?? null}
          staff={(staffRows as StaffMember[]) ?? []}
          currentUserId={user?.id ?? ""}
          billing={billing}
          voiceNotes={voiceNotesInfo}
          vertical={verticalInfo}
          brandKit={brandKit}
          logoUrl={logoUrl}
        />
      </div>
    </div>
  );
}
