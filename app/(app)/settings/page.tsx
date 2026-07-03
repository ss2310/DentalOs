import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/roles";
import { SettingsTabs } from "./settings-tabs";
import type { StaffMember } from "./staff-manager";
import type { Clinic } from "./clinic-info-form";
import type { RateCard } from "./rate-card-manager";
import type { LandingPageRow } from "./landing-pages-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: clinic }, { data: cards }, { data: pages }, { data: staffRows }] =
    await Promise.all([
      supabase
        .from("clinics")
        .select(
          "business_name, doctor_name, phone, address, city, area, google_review_url, instagram_handle, website_url, booking_slug",
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
    ]);

  const clinicData = (clinic as (Clinic & { booking_slug: string | null }) | null) ?? null;

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
        />
      </div>
    </div>
  );
}
