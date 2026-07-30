import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSignupCodeEmail } from "@/lib/email";

// Email verification codes for signup (migration 055). A 6-digit code is
// emailed BEFORE any clinic/user row exists; signUpAction requires it, so an
// account can only be created by someone who can read the inbox. Codes are
// stored HMAC-hashed (the DB never holds a usable code), keyed on the
// CANONICAL email (see canonicalEmail in lib/validation.ts) so Gmail dot/+tag
// variants share one cooldown and attempt budget.
//
// ZERO-BRICK: when migration 055 isn't applied yet every helper reports
// "unavailable" and the callers degrade to the pre-055 behavior (no code
// required). Paste the migration to arm the gate.

const CODE_TTL_MS = 15 * 60 * 1000; // 15 min
const RESEND_COOLDOWN_MS = 45 * 1000; // 45 s between sends
const MAX_ATTEMPTS = 8;

type DbError = { code?: string; message?: string } | null;

function isMissingSchema(error: DbError): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST205" || // PostgREST: table not in schema cache
    error.code === "PGRST202" || // PostgREST: function not found
    error.code === "42P01" || // Postgres: undefined table
    /schema cache|does not exist/i.test(error.message ?? "")
  );
}

// Deterministic across instances so a code requested on one serverless
// instance verifies on another. CRON_SECRET is already in the env; the
// service-role key is the fallback so the gate never silently weakens.
function hmacSecret(): string {
  return (
    process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  );
}

function hashCode(canonicalEmail: string, code: string): string {
  return createHmac("sha256", hmacSecret())
    .update(`${canonicalEmail}:${code}`)
    .digest("hex");
}

export type SendCodeResult =
  | { status: "sent" }
  | { status: "cooldown"; retryAfterSecs: number }
  | { status: "unavailable" } // migration 055 not applied — caller degrades
  | { status: "send_failed" };

/**
 * Generate + email a fresh code for this address. The cooldown is armed only
 * after a SUCCESSFUL send (a failed send shouldn't lock the user out of
 * retrying).
 */
export async function requestSignupCode(
  canonical: string,
  sendTo: string,
): Promise<SendCodeResult> {
  const admin = createAdminClient();

  const { data: existing, error: readErr } = await admin
    .from("email_verifications")
    .select("last_sent_at")
    .eq("email", canonical)
    .maybeSingle();
  if (readErr) {
    if (isMissingSchema(readErr)) return { status: "unavailable" };
    console.error("email_verifications read failed:", readErr.message);
    return { status: "send_failed" };
  }

  if (existing) {
    const since = Date.now() - new Date(existing.last_sent_at).getTime();
    if (since < RESEND_COOLDOWN_MS) {
      return {
        status: "cooldown",
        retryAfterSecs: Math.ceil((RESEND_COOLDOWN_MS - since) / 1000),
      };
    }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

  const sent = await sendSignupCodeEmail({ to: sendTo, code });
  if (!sent) return { status: "send_failed" };

  const { error: writeErr } = await admin.from("email_verifications").upsert(
    {
      email: canonical,
      code_hash: hashCode(canonical, code),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      attempts: 0,
      last_sent_at: new Date().toISOString(),
    },
    { onConflict: "email" },
  );
  if (writeErr) {
    if (isMissingSchema(writeErr)) return { status: "unavailable" };
    console.error("email_verifications write failed:", writeErr.message);
    return { status: "send_failed" };
  }

  return { status: "sent" };
}

export type VerifyCodeResult =
  | { status: "ok" }
  | { status: "unavailable" } // migration 055 not applied — caller degrades
  | { status: "no_code" } // nothing on file for this email
  | { status: "expired" }
  | { status: "too_many" }
  | { status: "wrong" };

/**
 * Check a submitted code and CONSUME it on success (one account per code).
 * Attempts are counted atomically in SQL so concurrent guesses can't race
 * past the cap.
 */
export async function verifyAndConsumeSignupCode(
  canonical: string,
  code: string,
): Promise<VerifyCodeResult> {
  const admin = createAdminClient();

  const { data: row, error: readErr } = await admin
    .from("email_verifications")
    .select("code_hash, expires_at, attempts")
    .eq("email", canonical)
    .maybeSingle();
  if (readErr) {
    if (isMissingSchema(readErr)) return { status: "unavailable" };
    console.error("email_verifications read failed:", readErr.message);
    return { status: "no_code" };
  }
  if (!row) return { status: "no_code" };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { status: "expired" };
  }
  if (row.attempts >= MAX_ATTEMPTS) return { status: "too_many" };

  const { data: bumped, error: bumpErr } = await admin.rpc(
    "bump_verification_attempts",
    { p_email: canonical },
  );
  if (bumpErr) {
    // Function missing (partial paste) — fall back to the non-atomic path
    // rather than blocking real users; the cap above still applies per read.
    if (!isMissingSchema(bumpErr)) {
      console.error("bump_verification_attempts failed:", bumpErr.message);
    }
  } else if (typeof bumped === "number" && bumped > MAX_ATTEMPTS) {
    return { status: "too_many" };
  }

  const expected = Buffer.from(row.code_hash, "hex");
  const actual = Buffer.from(hashCode(canonical, code.trim()), "hex");
  const match =
    expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!match) return { status: "wrong" };

  await admin.from("email_verifications").delete().eq("email", canonical);
  return { status: "ok" };
}

/**
 * Durable fixed-window rate limit (migration 055) — survives deploys and is
 * shared across instances, unlike lib/rate-limit.ts. FAIL-OPEN: any error
 * (including the migration not being applied) allows the call; the in-memory
 * limiter and the code gate still stand in front of abuse.
 */
export async function durableRateLimit(
  key: string,
  limit: number,
  windowSecs: number,
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("check_signup_rate", {
      p_key: key,
      p_limit: limit,
      p_window_secs: windowSecs,
    });
    if (error) {
      if (!isMissingSchema(error)) {
        console.error("check_signup_rate failed (allowing):", error.message);
      }
      return true;
    }
    return data !== false;
  } catch {
    return true;
  }
}

/**
 * Find an existing auth user whose email canonicalizes to the same inbox.
 * Pages the admin listUsers API (fine at current scale; swap for a filtered
 * lookup if the user base grows past a few thousand). Returns the matching
 * user's id, or null.
 */
export async function findUserByCanonicalEmail(
  canonical: string,
  canonicalize: (email: string) => string,
): Promise<string | null> {
  const admin = createAdminClient();
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) {
      console.error("listUsers failed during dedupe:", error.message);
      return null; // fail-open: createUser's own duplicate check still runs
    }
    const users = data?.users ?? [];
    for (const u of users) {
      if (u.email && canonicalize(u.email) === canonical) return u.id;
    }
    if (users.length < perPage) break;
  }
  return null;
}
