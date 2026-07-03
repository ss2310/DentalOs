import { createClient } from "@/lib/supabase/server";
import { SettingsTabs } from "./settings-tabs";
import type { Clinic } from "./clinic-info-form";
import type { RateCard } from "./rate-card-manager";
import type { LandingPageRow } from "./landing-pages-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = createClient();

  const [{ data: clinic }, { data: cards }, { data: pages }] =
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
        />
      </div>
    </div>
  );
}
