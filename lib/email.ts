import "server-only";
import { Resend } from "resend";

// Transactional email via Resend. Server-only — never import into a client
// component. Sending is best-effort: if the keys aren't set (e.g. local dev)
// or the send fails, we log and move on so it never blocks the user's flow.

const BRAND = "#0D9488";

// SEC-H3: user-supplied names (clinic / doctor) are interpolated into the
// email HTML — escape them so a name like `<img onerror=…>` can't inject
// markup into the message. The subject is a plain-text header, not HTML, so
// it doesn't need this.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Signup verification code (SEC: anti-bot signup, migration 055). Unlike the
 * welcome email this one REPORTS success — the caller must not arm the resend
 * cooldown or accept the code flow if the mail never left.
 */
export async function sendSignupCodeEmail(opts: {
  to: string;
  code: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    console.warn(
      "Resend not configured (RESEND_API_KEY/RESEND_FROM) — cannot send signup code.",
    );
    return false;
  }

  // The code is server-generated digits, but escape anyway (defense in depth).
  const safeCode = escapeHtml(opts.code);

  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111827">
    <div style="padding:24px 0;text-align:center">
      <span style="display:inline-block;background:${BRAND};color:#fff;font-size:12px;font-weight:600;padding:4px 12px;border-radius:999px">GrowthOS</span>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:24px;text-align:center">
      <h1 style="font-size:18px;margin:0 0 12px">Your verification code</h1>
      <p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:0 0 16px">${safeCode}</p>
      <p style="font-size:14px;line-height:1.6;color:#374151;margin:0">
        Enter this code on the signup page to finish creating your GrowthOS
        account. It expires in 15 minutes.
      </p>
    </div>
    <p style="font-size:12px;color:#6B7280;text-align:center;padding:16px 0">
      Didn't try to sign up? You can safely ignore this email.
    </p>
  </div>`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: `${opts.code} is your GrowthOS verification code`,
      html,
    });
    if (error) {
      console.error("Signup code email failed:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Signup code email failed:", err);
    return false;
  }
}

export async function sendWelcomeEmail(opts: {
  to: string;
  clinicName: string;
  doctorName: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    console.warn("Resend not configured (RESEND_API_KEY/RESEND_FROM) — skipping welcome email.");
    return;
  }

  const { to, clinicName, doctorName } = opts;
  const greetingName = escapeHtml(
    doctorName?.trim() ? doctorName.replace(/^dr\.?\s+/i, "").trim() : "there",
  );
  const safeClinicName = escapeHtml(clinicName ?? "");

  // Link to the real app when configured; omit the button otherwise (a link
  // whose domain doesn't match the sender hurts deliverability).
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  const ctaButton = appUrl
    ? `<a href="${appUrl}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-size:15px;font-weight:500;padding:10px 18px;border-radius:8px">Open GrowthOS</a>`
    : "";

  const html = `
  <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111827">
    <div style="padding:24px 0;text-align:center">
      <span style="display:inline-block;background:${BRAND};color:#fff;font-size:12px;font-weight:600;padding:4px 12px;border-radius:999px">GrowthOS</span>
    </div>
    <div style="border:1px solid #E5E7EB;border-radius:12px;padding:24px">
      <h1 style="font-size:20px;margin:0 0 12px">Welcome, Dr. ${greetingName}! 🦷</h1>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 12px">
        Your clinic <strong>${safeClinicName}</strong> is all set up on GrowthOS — your all-in-one
        system for appointments, billing, recalls, revenue recovery, and AI marketing content.
      </p>
      <p style="font-size:15px;line-height:1.6;color:#374151;margin:0 0 20px">
        Sign in any time to manage your patients and grow your practice.
      </p>
      ${ctaButton}
    </div>
    <p style="font-size:12px;color:#6B7280;text-align:center;padding:16px 0">
      You're receiving this because a GrowthOS account was created with this email.
    </p>
  </div>`;

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from,
      to,
      subject: `Welcome to GrowthOS, ${clinicName}!`,
      html,
    });
  } catch (err) {
    console.error("Welcome email failed:", err);
  }
}
