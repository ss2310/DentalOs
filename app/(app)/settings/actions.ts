"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeIndianPhone } from "@/lib/validation";

export type SettingsState = { ok?: boolean; error?: string };

async function clinicId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("home_clinic_id")
    .eq("id", user.id)
    .single();
  return data?.home_clinic_id ?? null;
}

// --- Clinic info ----------------------------------------------------------

export async function updateClinic(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const business_name = String(formData.get("business_name") ?? "").trim();
  const doctor_name = String(formData.get("doctor_name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  if (!business_name) return { error: "Clinic name is required." };

  const phone = normalizeIndianPhone(phoneRaw);
  if (!phone) return { error: "Enter a valid 10-digit clinic phone number." };

  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || null;
  };

  const supabase = createClient();
  const id = await clinicId();
  if (!id) return { error: "No clinic found for user." };

  const { error } = await supabase
    .from("clinics")
    .update({
      business_name,
      doctor_name: doctor_name || null,
      phone,
      address: str("address"),
      city: str("city"),
      area: str("area"),
      google_review_url: str("google_review_url"),
      instagram_handle: str("instagram_handle"),
      website_url: str("website_url"),
    })
    .eq("id", id);

  if (error) return { error: "Could not save. Please try again." };

  revalidatePath("/settings");
  revalidatePath("/", "layout"); // header shows the clinic name
  return { ok: true };
}

// --- Rate cards -----------------------------------------------------------

export type RateCardInput = {
  treatment_name: string;
  category: string;
  base_price: string;
  duration_mins: string;
  recall_interval_days: string;
};

function parseRateCard(input: RateCardInput):
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; error: string } {
  const treatment_name = input.treatment_name.trim();
  if (!treatment_name) return { ok: false, error: "Treatment name is required." };

  const price = Number(input.base_price);
  if (Number.isNaN(price) || price < 0) {
    return { ok: false, error: "Enter a valid price." };
  }
  const numOrNull = (s: string) => {
    const t = s.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isNaN(n) ? null : Math.round(n);
  };

  return {
    ok: true,
    row: {
      treatment_name,
      category: input.category.trim() || null,
      base_price: price,
      duration_mins: numOrNull(input.duration_mins),
      recall_interval_days: numOrNull(input.recall_interval_days),
    },
  };
}

export async function addRateCard(
  input: RateCardInput,
): Promise<SettingsState> {
  const parsed = parseRateCard(input);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = createClient();
  const id = await clinicId();
  if (!id) return { error: "No clinic found for user." };

  const { error } = await supabase
    .from("rate_cards")
    .insert({ ...parsed.row, clinic_id: id, is_active: true });
  if (error) return { error: "Could not add treatment. Please try again." };

  revalidatePath("/settings");
  return { ok: true };
}

export async function updateRateCard(
  cardId: string,
  input: RateCardInput,
): Promise<SettingsState> {
  const parsed = parseRateCard(input);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = createClient();
  const { error } = await supabase
    .from("rate_cards")
    .update(parsed.row)
    .eq("id", cardId);
  if (error) return { error: "Could not save. Please try again." };

  revalidatePath("/settings");
  return { ok: true };
}

/** Deactivate/reactivate — we never delete a rate card (visit history refs it). */
export async function setRateCardActive(
  cardId: string,
  active: boolean,
): Promise<SettingsState> {
  const supabase = createClient();
  const { error } = await supabase
    .from("rate_cards")
    .update({ is_active: active })
    .eq("id", cardId);
  if (error) return { error: "Could not update. Please try again." };

  revalidatePath("/settings");
  return { ok: true };
}
