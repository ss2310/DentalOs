// Warm Hinglish WhatsApp copy for the trial/subscription lifecycle, addressed to
// the clinic OWNER (a dentist). Used by the /admin dunning list to build one-tap
// wa.me links. The daily pg_cron job creates the in-app notifications separately;
// this is only the human-tapped WhatsApp text. Each message ends with the
// {NEXT_PUBLIC_APP_URL}/upgrade link so the owner lands straight on the page.

/** Absolute /upgrade URL from NEXT_PUBLIC_APP_URL (trailing slash tolerant). */
export function upgradeUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  return `${base}/upgrade`;
}

function greeting(doctorName?: string | null): string {
  const name = (doctorName ?? "").trim();
  return name ? `Namaste ${name} 🙏` : "Namaste 🙏";
}

/** Trial ending in `daysLeft` days (0 = today). Tone sharpens as it nears zero. */
export function trialEndingMessage(daysLeft: number, doctorName?: string | null): string {
  const g = greeting(doctorName);
  const url = upgradeUrl();
  if (daysLeft <= 0) {
    return `${g} Aaj aapka GrowthOS free trial khatam ho raha hai. Account active rakhne ke liye aaj hi upgrade karein 🙏\n${url}`;
  }
  if (daysLeft <= 2) {
    return `${g} Sirf ${daysLeft} din bache hain — aapka GrowthOS free trial ${daysLeft} din mein khatam ho raha hai. Account band hone se bachane ke liye aaj hi upgrade karein 🙏\n${url}`;
  }
  return `${g} Aapka GrowthOS free trial ${daysLeft} din mein khatam ho raha hai. Upgrade karke apna account active rakhein 🙏\n${url}`;
}

/** Trial has ended (now in the past_due grace window). */
export function trialEndedMessage(doctorName?: string | null): string {
  return `${greeting(doctorName)} Aapka GrowthOS free trial khatam ho gaya hai. Account active rakhne ke liye upgrade karein 🙏\n${upgradeUrl()}`;
}

/** Account deactivated after the grace window. */
export function deactivatedMessage(doctorName?: string | null): string {
  return `${greeting(doctorName)} Aapka GrowthOS account deactivate ho gaya hai. Reactivate karne ke liye upgrade karein 🙏\n${upgradeUrl()}`;
}
