import { createClient } from "@/lib/supabase/server";
import { SettingsTabs } from "./settings-tabs";
import type { Clinic } from "./clinic-info-form";
import type { RateCard } from "./rate-card-manager";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = createClient();

  const [{ data: clinic }, { data: cards }] = await Promise.all([
    supabase
      .from("clinics")
      .select(
        "business_name, doctor_name, phone, address, city, area, google_review_url, instagram_handle, website_url",
      )
      .single(),
    supabase
      .from("rate_cards")
      .select(
        "id, treatment_name, category, base_price, duration_mins, recall_interval_days, is_active",
      )
      .order("is_active", { ascending: false })
      .order("treatment_name", { ascending: true }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>
      <div className="mt-6">
        <SettingsTabs
          clinic={(clinic as Clinic) ?? ({} as Clinic)}
          rateCards={(cards as RateCard[]) ?? []}
        />
      </div>
    </div>
  );
}
