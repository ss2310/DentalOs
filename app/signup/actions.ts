"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail, normalizeIndianPhone } from "@/lib/validation";

export type SignupState = { error?: string };

// Seeded on signup for every new clinic. Prices in ₹; recall interval in days
// (null = no recall). See CLAUDE.md for locale rules.
const DEFAULT_RATE_CARDS = [
  { treatment_name: "Consultation", category: "Diagnostic", base_price: 300, duration_mins: 15, recall_interval_days: 180 },
  { treatment_name: "Scaling & Polishing", category: "Preventive", base_price: 1500, duration_mins: 45, recall_interval_days: 180 },
  { treatment_name: "Tooth Extraction", category: "Surgical", base_price: 1000, duration_mins: 30, recall_interval_days: null },
  { treatment_name: "RCT Single Sitting", category: "Endodontics", base_price: 4500, duration_mins: 60, recall_interval_days: 30 },
  { treatment_name: "RCT Multi Sitting", category: "Endodontics", base_price: 6000, duration_mins: 60, recall_interval_days: 30 },
  { treatment_name: "Composite Filling", category: "Restorative", base_price: 1200, duration_mins: 30, recall_interval_days: 365 },
  { treatment_name: "Crown Metal-Ceramic", category: "Prosthodontics", base_price: 4000, duration_mins: 45, recall_interval_days: null },
  { treatment_name: "Crown Zirconia", category: "Prosthodontics", base_price: 9000, duration_mins: 45, recall_interval_days: null },
  { treatment_name: "Teeth Whitening", category: "Cosmetic", base_price: 8000, duration_mins: 60, recall_interval_days: 365 },
  { treatment_name: "Dental Implant", category: "Implantology", base_price: 35000, duration_mins: 90, recall_interval_days: 90 },
];

export async function signUpAction(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const clinicName = String(formData.get("clinicName") ?? "").trim();
  const doctorName = String(formData.get("doctorName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const phone = String(formData.get("phone") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();

  if (!clinicName || !doctorName || !email || !password || !phone) {
    return {
      error: "Clinic name, doctor name, email, phone and password are required.",
    };
  }
  if (!isValidEmail(email)) {
    return { error: "Enter a valid email address." };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  // Store the normalized 10-digit number (see CLAUDE.md locale rules).
  const normalizedPhone = normalizeIndianPhone(phone);
  if (!normalizedPhone) {
    return { error: "Enter a valid 10-digit Indian mobile number." };
  }

  const admin = createAdminClient();

  // 1. Create the clinic (RLS blocks client inserts, so this uses the
  //    service role — the one legitimate cross-tenant write on signup).
  const { data: clinic, error: clinicError } = await admin
    .from("clinics")
    .insert({
      business_name: clinicName,
      doctor_name: doctorName,
      phone: normalizedPhone,
      city: city || null,
    })
    .select("id")
    .single();

  if (clinicError || !clinic) {
    return { error: "Could not create clinic. Please try again." };
  }

  // 2. Create the auth user. The handle_new_user trigger reads this metadata
  //    to create the profiles row (role clinic_owner, linked to the clinic).
  //
  //    LAUNCH NOTE: `email_confirm: true` marks the email pre-confirmed so
  //    test clinics are instant during the build. Because users are created
  //    via the admin API, this flag — not the dashboard "Confirm email"
  //    toggle — controls confirmation here. To require confirmation before
  //    launch, remove this flag (and switch to a client signUp flow that
  //    sends the verification email); flipping the dashboard toggle alone is
  //    not enough for admin-created users.
  const { error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: doctorName,
      role: "clinic_owner",
      home_clinic_id: clinic.id,
    },
  });

  if (userError) {
    // Roll back the orphaned clinic.
    await admin.from("clinics").delete().eq("id", clinic.id);
    const alreadyExists = /registered|already/i.test(userError.message);
    return {
      error: alreadyExists
        ? "An account with this email already exists."
        : "Could not create your account. Please try again.",
    };
  }

  // 3. Seed the clinic's rate cards.
  const { error: rateCardError } = await admin.from("rate_cards").insert(
    DEFAULT_RATE_CARDS.map((rc) => ({ ...rc, clinic_id: clinic.id })),
  );
  if (rateCardError) {
    // Non-fatal: the account is usable and rate cards can be added in
    // Settings. Log for visibility rather than blocking onboarding.
    console.error("Failed to seed rate cards:", rateCardError.message);
  }

  // 4. Sign the new owner in (sets the session cookie via the server client).
  const supabase = createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    // Account exists but auto-login failed — send them to the login page.
    redirect("/");
  }

  redirect("/dashboard");
}
