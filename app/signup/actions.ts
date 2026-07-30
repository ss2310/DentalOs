"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  canonicalEmail,
  isValidEmail,
  normalizeIndianPhone,
} from "@/lib/validation";
import { sendWelcomeEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { multiVerticalEnabled } from "@/lib/multi-vertical-access";
import { resolveStarterRateCards } from "@/lib/starter-rate-cards";
import { isDisposableEmail } from "@/lib/disposable-email";
import { verifyTurnstileToken } from "@/lib/turnstile";
import {
  durableRateLimit,
  findUserByCanonicalEmail,
  requestSignupCode,
  verifyAndConsumeSignupCode,
} from "@/lib/signup-verification";

export type SignupState = { error?: string };

function clientIp(): string {
  const hdrs = headers();
  return (
    (hdrs.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    hdrs.get("x-real-ip") ||
    "unknown"
  );
}

export type SendCodeResult =
  | { status: "sent" }
  | { status: "skip" } // migration 055 not applied — form submits without a code
  | { status: "error"; error: string };

/**
 * Phase 1 of signup: email a 6-digit verification code (SEC: anti-bot).
 * Turnstile is enforced HERE — a code can only be minted by something that
 * passed the human check, and the final signUpAction requires a valid code,
 * so the whole flow is gated without needing two captcha tokens.
 */
export async function sendSignupCodeAction(input: {
  email: string;
  turnstileToken: string | null;
}): Promise<SendCodeResult> {
  const email = String(input?.email ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    return { status: "error", error: "Enter a valid email address." };
  }
  if (isDisposableEmail(email)) {
    return {
      status: "error",
      error:
        "Temporary email addresses aren't supported. Please use your regular email.",
    };
  }

  const ip = clientIp();
  const HOUR = 60 * 60 * 1000;
  const canonical = canonicalEmail(email);
  // In-memory speed bump + durable cross-instance cap (migration 055).
  const memOk =
    rateLimit(`code:ip:${ip}`, 10, HOUR).ok &&
    rateLimit(`code:email:${canonical}`, 5, HOUR).ok;
  const dbOk =
    (await durableRateLimit(`code:ip:${ip}`, 10, 3600)) &&
    (await durableRateLimit(`code:email:${canonical}`, 5, 3600));
  if (!memOk || !dbOk) {
    return {
      status: "error",
      error: "Too many attempts. Please wait a while and try again.",
    };
  }

  const turnstile = await verifyTurnstileToken(input?.turnstileToken ?? null, ip);
  if (!turnstile.ok) {
    return {
      status: "error",
      error:
        turnstile.reason === "missing"
          ? "Please complete the human check below, then try again."
          : "Human check failed — refresh the page and try again.",
    };
  }

  // Canonical dedupe up front: dotted-Gmail variants of an existing account
  // are the same inbox and must not mint a second clinic.
  const existing = await findUserByCanonicalEmail(canonical, canonicalEmail);
  if (existing) {
    return {
      status: "error",
      error: "An account with this email already exists. Sign in instead.",
    };
  }

  const result = await requestSignupCode(canonical, email);
  switch (result.status) {
    case "sent":
      return { status: "sent" };
    case "unavailable":
      // Migration 055 not pasted yet — degrade to the pre-055 flow.
      console.warn(
        "email_verifications missing (migration 055 not applied) — signup code gate is OFF.",
      );
      return { status: "skip" };
    case "cooldown":
      return {
        status: "error",
        error: `A code was just sent — wait ${result.retryAfterSecs}s before resending.`,
      };
    default:
      return {
        status: "error",
        error: "Couldn't send the code. Check the address and try again.",
      };
  }
}

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
  if (isDisposableEmail(email)) {
    return {
      error:
        "Temporary email addresses aren't supported. Please use your regular email.",
    };
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  // SEC-H3: throttle signup so a script can't mass-mint clinics. In-memory
  // speed bump + durable cross-instance counters (migration 055; fail-open
  // pre-paste). Keyed on both client IP and CANONICAL email so Gmail dot
  // variants share one budget. This is the only path that creates a credited
  // clinic (service-role onboarding), so it's the one to protect.
  const ip = clientIp();
  const HOUR = 60 * 60 * 1000;
  const canonical = canonicalEmail(email);
  const ipOk = rateLimit(`signup:ip:${ip}`, 5, HOUR).ok;
  const emailOk = rateLimit(`signup:email:${canonical}`, 3, HOUR).ok;
  const dbOk =
    (await durableRateLimit(`signup:ip:${ip}`, 5, 3600)) &&
    (await durableRateLimit(`signup:email:${canonical}`, 3, 3600));
  if (!ipOk || !emailOk || !dbOk) {
    return {
      error: "Too many signup attempts. Please wait a while and try again.",
    };
  }

  // SEC: the emailed verification code is the hard anti-bot gate — no clinic
  // or auth user exists until the inbox proved itself. Consumed on success
  // (one account per code). Degrades to the pre-055 flow only while the
  // migration is unpasted.
  const code = String(formData.get("code") ?? "").trim();
  const verification = await verifyAndConsumeSignupCode(canonical, code);
  switch (verification.status) {
    case "ok":
      break;
    case "unavailable":
      console.warn(
        "email_verifications missing (migration 055 not applied) — accepting signup without a code.",
      );
      break;
    case "expired":
      return {
        error: "That code has expired. Request a new one and try again.",
      };
    case "too_many":
      return {
        error:
          "Too many incorrect codes. Request a new code and try again.",
      };
    default:
      return {
        error: code
          ? "That code isn't right. Check the email we sent you."
          : "Enter the verification code we emailed you.",
      };
  }

  // Canonical dedupe: a dotted-Gmail variant of an existing account is the
  // same inbox — reject before any row is created. (createUser below still
  // catches EXACT duplicates as the backstop.)
  const dupUser = await findUserByCanonicalEmail(canonical, canonicalEmail);
  if (dupUser) {
    return { error: "An account with this email already exists." };
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
  // (30 content / 2 map — pricing v2, migration 047: the trial should taste,
  // not feast); the ledger rows below record that grant for history.
  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const TRIAL_CONTENT = 30;
  const TRIAL_MAP = 2;

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
      // Deep Audit is NOT included in the free trial — each run costs us ~₹100
      // in API spend. Trials start with 0 audit credits; the clinic gets one by
      // upgrading to Growth (grants 1/period) or buying the ₹599 top-up. This
      // overrides the clinics.deep_audit_credits column default (migration 050
      // moves that default to 0 too, so both paths agree).
      deep_audit_credits: 0,
      // Self-serve clinics pay through the live gateway (Cashfree hosted
      // checkout). 'manual' is an admin-only escape hatch for hand-onboarding,
      // set per-clinic from /admin — never the signup default, or the in-app
      // Buy buttons just file a silent pending order instead of opening
      // checkout. (lib/billing/provider.ts documents 'cashfree' as the default.)
      billing_provider: "cashfree",
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
  //    `email_confirm: true` is now EARNED, not assumed: the emailed 6-digit
  //    code above (migration 055) already proved this inbox before any row
  //    was created, so marking the email confirmed here is correct — no
  //    second confirmation mail needed. (Because users are created via the
  //    admin API, this flag — not the dashboard "Confirm email" toggle — is
  //    what controls confirmation.)
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

  // 3. Seed the clinic's starter rate cards for its vertical (dental fallback).
  const { error: rateCardError } = await admin.from("rate_cards").insert(
    resolveStarterRateCards(vertical).map((rc) => ({ ...rc, clinic_id: clinic.id })),
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
