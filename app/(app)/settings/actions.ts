"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeIndianPhone } from "@/lib/validation";
import { isValidUpiId } from "@/lib/upi";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { VOICE_BUCKET } from "@/lib/voice-notes";
import { multiVerticalEnabled } from "@/lib/multi-vertical-access";

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

/** Guard for the settings mutations below — owner/doctor only. */
async function denyIfNotAdmin(): Promise<SettingsState | null> {
  return isAdminRole(await getUserRole())
    ? null
    : { error: "Only an owner or doctor can change clinic settings." };
}

// --- Clinic info ----------------------------------------------------------

export async function updateClinic(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  const business_name = String(formData.get("business_name") ?? "").trim();
  const doctor_name = String(formData.get("doctor_name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();

  if (!business_name) return { error: "Clinic name is required." };
  if (!doctor_name) return { error: "Doctor name is required." };

  const phone = normalizeIndianPhone(phoneRaw);
  if (!phone) return { error: "Enter a valid 10-digit clinic phone number." };

  const str = (k: string) => {
    const v = String(formData.get(k) ?? "").trim();
    return v || null;
  };

  // City / area / address are part of the required profile (lib/clinic-profile
  // gate): generation, wa.me copy, and local SEO all assume they exist.
  const city = str("city");
  const area = str("area");
  const address = str("address");
  if (!city) return { error: "City is required." };
  if (!area) return { error: "Area is required (e.g. Vaishali Nagar)." };
  if (!address) return { error: "Address is required." };

  // Clinic location (map-scan centre). Set once here; blank = not set. Require
  // both or neither so we never store a half-coordinate.
  const coord = (k: string, lo: number, hi: number): number | null | "bad" => {
    const raw = String(formData.get(k) ?? "").trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= lo && n <= hi ? n : "bad";
  };
  const default_lat = coord("default_lat", -90, 90);
  const default_lng = coord("default_lng", -180, 180);
  if (default_lat === "bad" || default_lng === "bad") {
    return { error: "Enter a valid clinic location (latitude and longitude)." };
  }
  if ((default_lat === null) !== (default_lng === null)) {
    return { error: "Set both latitude and longitude, or leave both blank." };
  }

  // UPI ID — optional; loosely validated (something@something, no spaces).
  const upiRaw = String(formData.get("upi_id") ?? "").trim();
  if (upiRaw && !isValidUpiId(upiRaw)) {
    return { error: "Enter a valid UPI ID, e.g. clinicname@okhdfcbank." };
  }
  const upi_id = upiRaw || null;

  const supabase = createClient();
  const id = await clinicId();
  if (!id) return { error: "No clinic found for user." };

  const { error } = await supabase
    .from("clinics")
    .update({
      business_name,
      doctor_name,
      phone,
      address,
      city,
      area,
      google_review_url: str("google_review_url"),
      instagram_handle: str("instagram_handle"),
      website_url: str("website_url"),
      upi_id,
      default_lat,
      default_lng,
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
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

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
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

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

// --- Vertical (multi-vertical) --------------------------------------------

/**
 * Set the clinic's vertical from Settings. Owner/doctor only, and only when the
 * multi-vertical UI is enabled. `clinics.vertical` is column-locked (migration
 * 019), so this goes through the set_clinic_vertical definer fn (migration 027),
 * which re-checks admin + that the target vertical is active. When the flag is
 * off this is a no-op guard — the UI never renders the control.
 */
export async function setClinicVertical(
  vertical: string,
): Promise<SettingsState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;
  if (!multiVerticalEnabled()) {
    return { error: "Vertical selection is not enabled." };
  }
  const slug = String(vertical ?? "").trim();
  if (!slug) return { error: "Choose a vertical." };

  const supabase = createClient();
  const { error } = await supabase.rpc("set_clinic_vertical", {
    p_vertical: slug,
  });
  if (error) return { error: "Could not update the vertical. Please try again." };

  revalidatePath("/settings");
  revalidatePath("/generate"); // content resolution depends on the vertical
  return { ok: true };
}

// --- Voice Notes ----------------------------------------------------------

/**
 * Clinic self-serve toggle for the `voice_notes` feature flag. Owner/doctor only.
 * Reads the current flags and merges just this one key so it can never clobber
 * flags a super-admin set. The global ENABLE_VOICE_NOTES kill-switch still gates
 * whether the feature actually appears — this only sets the clinic's own bit.
 */
export async function setVoiceNotesEnabled(
  enabled: boolean,
): Promise<SettingsState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  const supabase = createClient();
  // `feature_flags` is column-locked (migration 019) — authenticated users can't
  // UPDATE it directly. The set_voice_notes_enabled definer fn (migration 025)
  // flips ONLY the voice_notes key for the caller's own clinic, after its own
  // admin check, so a clinic can never toggle another flag or another tenant.
  const { error } = await supabase.rpc("set_voice_notes_enabled", {
    p_enabled: enabled,
  });
  if (error) return { error: "Could not update. Please try again." };

  revalidatePath("/settings");
  revalidatePath("/", "layout"); // sidebar shows/hides the Notes link
  return { ok: true };
}

/**
 * DPDP hygiene: permanently erase every voice note + follow-up for this clinic,
 * plus any stored audio. Owner/doctor only, and irreversible. Deleting the
 * clinic_notes rows cascades to followup_tasks and agent_audit (both FK
 * on-delete-cascade on note_id); we also sweep any follow-ups not tied to a note
 * and remove leftover audio objects. All reads/writes are RLS-scoped to the
 * caller's clinic — this can never touch another tenant's data.
 */
export async function deleteAllVoiceNotesData(): Promise<
  SettingsState & { deleted?: number }
> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  const supabase = createClient();
  const id = await clinicId();
  if (!id) return { error: "No clinic found for user." };

  // Remove any audio still in the private bucket (most is already purged on
  // confirm / by the retention cron). Storage RLS scopes the prefix to us.
  const { data: objects } = await supabase.storage
    .from(VOICE_BUCKET)
    .list(id, { limit: 1000 });
  if (objects && objects.length > 0) {
    await supabase.storage
      .from(VOICE_BUCKET)
      .remove(objects.map((o) => `${id}/${o.name}`));
  }

  // Follow-ups not tied to a note wouldn't cascade — clear them explicitly first.
  await supabase.from("followup_tasks").delete().not("id", "is", null);

  // Deleting the notes cascades to their follow-ups + agent_audit rows.
  const { data: removed, error } = await supabase
    .from("clinic_notes")
    .delete()
    .not("id", "is", null)
    .select("id");
  if (error) return { error: "Could not delete voice-note data." };

  revalidatePath("/settings");
  revalidatePath("/notes");
  return { ok: true, deleted: removed?.length ?? 0 };
}

/** Deactivate/reactivate — we never delete a rate card (visit history refs it). */
export async function setRateCardActive(
  cardId: string,
  active: boolean,
): Promise<SettingsState> {
  const denied = await denyIfNotAdmin();
  if (denied) return denied;

  const supabase = createClient();
  const { error } = await supabase
    .from("rate_cards")
    .update({ is_active: active })
    .eq("id", cardId);
  if (error) return { error: "Could not update. Please try again." };

  revalidatePath("/settings");
  return { ok: true };
}
