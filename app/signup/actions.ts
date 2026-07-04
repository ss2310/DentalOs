"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidEmail, normalizeIndianPhone } from "@/lib/validation";
import { sendWelcomeEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { multiVerticalEnabled } from "@/lib/multi-vertical-access";

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
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  // SEC-H3: throttle signup so a script can't mass-mint clinics. Keyed on both
  // client IP and email (best-effort in-memory; see lib/rate-limit.ts). This is
  // the only path that creates a credited clinic (service-role onboarding), so
  // it's the one to protect.
  const hdrs = headers();
  const ip =
    (hdrs.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    hdrs.get("x-real-ip") ||
    "unknown";
  const HOUR = 60 * 60 * 1000;
  const ipOk = rateLimit(`signup:ip:${ip}`, 5, HOUR).ok;
  const emailOk = rateLimit(`signup:email:${email.toLowerCase()}`, 3, HOUR).ok;
  if (!ipOk || !emailOk) {
    return {
      error: "Too many signup attempts. Please wait a while and try again.",
    };
  }

  // Store the normalized 10-digit number (see CLAUDE.md locale rules).
  const normalizedPhone = normalizeIndianPhone(phone);
  if (!normalizedPhone) {
    return { error: "Enter a valid 10-digit Indian mobile number." };
  }

  const admin = createAdminClient();

  // Data integrity: one clinic per phone number. Reject a number already on file
  // (checked with the service role since clinics is RLS-locked). This is the
  // friendly-error guard; the unique index in migration 029 is the hard backstop
  // against a race.
  const { data: phoneTaken } = await admin
    .from("clinics")
    .select("id")
    .eq("phone", normalizedPhone)
    .limit(1);
  if (phoneTaken && phoneTaken.length > 0) {
    return {
      error:
        "This mobile number is already registered to a clinic. Use a different number, or sign in to your existing account.",
    };
  }

  // Vertical: honored ONLY when the multi-vertical flag is on AND the submitted
  // slug is a real, active vertical — otherwise omitted so the clinic takes the
  // DB default 'dental'. This is the one place a NEW clinic's vertical is set
  // (service role bypasses the clinics column-lock).
  let vertical: string | null = null;
  if (multiVerticalEnabled()) {
    const raw = String(formData.get("vertical") ?? "").trim();
    if (raw) {
      const { data: v } = await admin
        .from("verticals")
        .select("id")
        .eq("id", raw)
        .eq("is_active", true)
        .maybeSingle();
      if (v) vertical = v.id;
    }
  }

  // Trial window: 30 days from signup. Balances start at the Free Trial grant
  // (50 content / 4 map); the ledger rows below record that grant for history.
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const TRIAL_CONTENT = 50;
  const TRIAL_MAP = 4;

  // Look up the seeded Free Trial plan (migration 019). Degrade to a null plan_id
  // if the catalog isn't seeded yet — the trial status + balances still apply.
  const { data: freeTrial } = await admin
    .from("plans")
    .select("id")
    .eq("name", "Free Trial")
    .maybeSingle();

  // 1. Create the clinic (RLS blocks client inserts, so this uses the
  //    service role — the one legitimate cross-tenant write on signup).
  const { data: clinic, error: clinicError } = await admin
    .from("clinics")
    .insert({
      business_name: clinicName,
      doctor_name: doctorName,
      phone: normalizedPhone,
      city: city || null,
      subscription_status: "trial",
      plan_id: freeTrial?.id ?? null,
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEndsAt.toISOString(),
      content_credits_balance: TRIAL_CONTENT,
      map_credits_balance: TRIAL_MAP,
      billing_provider: "manual",
      // Omitted when null → DB default 'dental' (today's behavior).
      ...(vertical ? { vertical } : {}),
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
  //    SECURITY: role + clinic linkage go in app_metadata (raw_app_meta_data),
  //    which only the service-role admin API can set — the public GoTrue signup
  //    endpoint cannot. handle_new_user() (migration 014) trusts authz ONLY from
  //    there, so a self-serve signup can't forge an owner role or clinic link.
  //    full_name stays in user_metadata (cosmetic, no authz).
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: doctorName,
    },
    app_metadata: {
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

  const newUserId = created.user?.id ?? null;

  // Deterministically set the owner's role + clinic link. The handle_new_user
  // trigger (migration 014) normally reads these from app_metadata, but GoTrue
  // can persist custom app_metadata in a step AFTER the auth-row insert the
  // trigger fires on — intermittently leaving the owner as the default
  // 'receptionist' with no clinic. Setting it explicitly here (service role
  // bypasses the profiles column-lock) makes onboarding deterministic. Idempotent:
  // when the trigger already got it right, this writes the same values.
  if (newUserId) {
    const { error: profErr } = await admin
      .from("profiles")
      .upsert(
        {
          id: newUserId,
          full_name: doctorName,
          role: "clinic_owner",
          home_clinic_id: clinic.id,
        },
        { onConflict: "id" },
      );
    if (profErr) {
      // Without the owner role + clinic link the account is unusable — roll back
      // the half-created user + clinic rather than strand a broken login.
      await admin.auth.admin.deleteUser(newUserId);
      await admin.from("clinics").delete().eq("id", clinic.id);
      console.error("Owner profile setup failed:", profErr.message);
      return {
        error: "Could not finish setting up your account. Please try again.",
      };
    }
  }

  // Record the trial grant + lifecycle + welcome, all best-effort (never block
  // onboarding — the account is already usable). Balances are already set on the
  // clinic row above, so the ledger rows only RECORD the grant, they don't re-add.
  const { error: ledgerErr } = await admin.from("credit_ledger").insert([
    {
      clinic_id: clinic.id,
      kind: "content",
      delta: TRIAL_CONTENT,
      reason: "trial_grant",
      balance_after: TRIAL_CONTENT,
      created_by: newUserId,
    },
    {
      clinic_id: clinic.id,
      kind: "map",
      delta: TRIAL_MAP,
      reason: "trial_grant",
      balance_after: TRIAL_MAP,
      created_by: newUserId,
    },
  ]);
  if (ledgerErr) console.error("Trial ledger seed failed:", ledgerErr.message);

  const { error: eventErr } = await admin.from("billing_events").insert({
    clinic_id: clinic.id,
    event_type: "trial_started",
    provider: "manual",
    note: "30-day free trial started",
    actor: newUserId,
  });
  if (eventErr) console.error("Trial billing_event failed:", eventErr.message);

  // Welcome notification. Under the service role auth.uid() is null, so
  // create_notification's clinic-ownership guard is skipped (it only enforces
  // when a user is present). Best-effort.
  const { error: notifErr } = await admin.rpc("create_notification", {
    p_clinic_id: clinic.id,
    p_type: "system",
    p_priority: "routine",
    p_title: "Welcome to GrowthOS 🎉",
    p_body: `Your 30-day free trial is live — ${TRIAL_CONTENT} content credits and ${TRIAL_MAP} map scans to start. Explore the dashboard to get going.`,
    p_action_url: "/dashboard",
  });
  if (notifErr) console.error("Welcome notification failed:", notifErr.message);

  // 3. Seed the clinic's rate cards.
  const { error: rateCardError } = await admin.from("rate_cards").insert(
    DEFAULT_RATE_CARDS.map((rc) => ({ ...rc, clinic_id: clinic.id })),
  );
  if (rateCardError) {
    // Non-fatal: the account is usable and rate cards can be added in
    // Settings. Log for visibility rather than blocking onboarding.
    console.error("Failed to seed rate cards:", rateCardError.message);
  }

  // Best-effort welcome email (no-op if Resend isn't configured).
  await sendWelcomeEmail({ to: email, clinicName, doctorName });

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
