"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeIndianPhone } from "@/lib/validation";

export type PatientFormState = { ok?: boolean; error?: string };

type ParsedPatient = {
  full_name: string;
  whatsapp_number: string;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  area: string | null;
  notes: string | null;
  referral_source: string | null;
};

function parse(formData: FormData): ParsedPatient | { error: string } {
  const full_name = String(formData.get("full_name") ?? "").trim();
  const whatsappRaw = String(formData.get("whatsapp_number") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const dob = String(formData.get("date_of_birth") ?? "").trim();
  const gender = String(formData.get("gender") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const referral = String(formData.get("referral_source") ?? "").trim();

  if (!full_name) return { error: "Name is required." };

  const whatsapp = normalizeIndianPhone(whatsappRaw);
  if (!whatsapp) {
    return { error: "Enter a valid 10-digit WhatsApp number." };
  }

  // Phone is optional; normalize when present so it's WhatsApp-ready too.
  let phone: string | null = null;
  if (phoneRaw) {
    phone = normalizeIndianPhone(phoneRaw) ?? phoneRaw;
  }

  return {
    full_name,
    whatsapp_number: whatsapp,
    phone,
    date_of_birth: dob || null,
    gender: gender || null,
    area: area || null,
    notes: notes || null,
    referral_source: referral.slice(0, 100) || null,
  };
}

export async function addPatient(
  _prev: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  const parsed = parse(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // clinic_id is required by the RLS WITH CHECK policy on inserts.
  const { data: profile } = await supabase
    .from("profiles")
    .select("home_clinic_id")
    .eq("id", user.id)
    .single();
  if (!profile?.home_clinic_id) return { error: "No clinic found for user." };

  let { error } = await supabase
    .from("patients")
    .insert({ ...parsed, clinic_id: profile.home_clinic_id });

  // Graceful pre-053 fallback: referral_source doesn't exist until the
  // migration runs — never let a mid-rollout deploy block adding patients.
  if (error && /referral_source/i.test(error.message ?? "")) {
    const legacy: Record<string, unknown> = {
      ...parsed,
      clinic_id: profile.home_clinic_id,
    };
    delete legacy.referral_source;
    ({ error } = await supabase.from("patients").insert(legacy));
  }

  if (error) return { error: "Could not add patient. Please try again." };

  revalidatePath("/patients");
  return { ok: true };
}

export async function updatePatient(
  _prev: PatientFormState,
  formData: FormData,
): Promise<PatientFormState> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Missing patient id." };

  const parsed = parse(formData);
  if ("error" in parsed) return { error: parsed.error };

  const supabase = createClient();
  // RLS scopes this update to the caller's clinic; no clinic_id needed.
  let { error } = await supabase.from("patients").update(parsed).eq("id", id);

  // Same pre-053 fallback as addPatient.
  if (error && /referral_source/i.test(error.message ?? "")) {
    const legacy: Record<string, unknown> = { ...parsed };
    delete legacy.referral_source;
    ({ error } = await supabase.from("patients").update(legacy).eq("id", id));
  }

  if (error) return { error: "Could not update patient. Please try again." };

  revalidatePath("/patients");
  revalidatePath(`/patients/${id}`);
  return { ok: true };
}
