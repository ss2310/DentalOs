// Moment Capture — pure consent + anti-abuse logic (dependency-free .mjs so it
// runs under `node --test`, scripts/test-capture-consent.mjs). Every gate the
// feature enforces is defined HERE and imported by the queries/actions — the
// UI never carries the rule alone.

// The one value the S2 composer and the social picker admit. Queries filter
// with .eq("consent_type", SOCIAL_CONSENT) — a 'review_only' moment is
// invisible to social at the QUERY level, not hidden client-side.
export const SOCIAL_CONSENT = "review_and_social";

// 30-day one-review-request-per-patient rule, spanning surveys AND captures
// (and the appointments module's direct review asks).
export const REVIEW_ASK_COOLDOWN_DAYS = 30;
const DAY_MS = 86_400_000;

/**
 * Derive the stored consent_type from the two explicit toggles.
 * B (social) on → 'review_and_social' (the photo may be composed for social;
 * consent_review separately gates the review ask). A only → 'review_only'.
 * Neither → null: the moment is UNSAVABLE (DPDP — no consent, no storage).
 */
export function deriveConsentType(consentReview, consentSocial) {
  if (consentSocial) return "review_and_social";
  if (consentReview) return "review_only";
  return null;
}

/** May this moment enter the S2 composer / social picker? */
export function canComposeSocially(moment) {
  return moment?.consent_type === SOCIAL_CONSENT;
}

/**
 * The 30-day cap. `priorAsks` is every review-touch timestamp we know for the
 * patient — survey_responses.sent_at, capture_moments.review_request_sent_at,
 * appointments' review_requested_at — as ISO strings (nulls tolerated).
 * Returns { allowed, daysAgo } where daysAgo is the most recent ask's age.
 */
export function reviewAskAllowed(priorAsks, nowMs) {
  let latest = null;
  for (const iso of priorAsks ?? []) {
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (!Number.isNaN(t) && (latest == null || t > latest)) latest = t;
  }
  if (latest == null) return { allowed: true, daysAgo: null };
  const daysAgo = Math.floor((nowMs - latest) / DAY_MS);
  return { allowed: daysAgo >= REVIEW_ASK_COOLDOWN_DAYS, daysAgo };
}

/**
 * The Hinglish review ask. Deliberately takes NO photo/media input — a photo
 * can never ride along with a review message (and wa.me is text-only anyway).
 * No medical claims: the message mentions the visit, never the treatment
 * outcome.
 */
export function captureReviewMessage(patientName, reviewUrl) {
  const name = String(patientName ?? "").trim() || "ji";
  return (
    `Hi ${name} ji, aaj clinic aane ke liye shukriya 😊\n` +
    `Agar aapka experience accha raha, toh 30 second mein ek Google review chhod dein — bahut madad hogi:\n` +
    `🔗 ${reviewUrl}\nDhanyavaad! 🙏`
  );
}
