import "server-only";
import { Resend } from "resend";

// Transactional email via Resend. Server-only — never import into a client
// component. Sending is best-effort: if the keys aren't set (e.g. local dev)
// or the send fails, we log and move on so it never blocks the user's flow.

const BRAND = "#0D9488";

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
  const greetingName = doctorName?.trim()
    ? doctorName.replace(/^dr\.?\s+/i, "").trim()
    : "there";

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
        Your clinic <strong>${clinicName}</strong> is all set up on GrowthOS — your all-in-one
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
