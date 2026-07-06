export const SOCIAL_CONSENT: "review_and_social";
export const REVIEW_ASK_COOLDOWN_DAYS: number;

export type ConsentType = "review_only" | "review_and_social";

export function deriveConsentType(
  consentReview: boolean,
  consentSocial: boolean,
): ConsentType | null;

export function canComposeSocially(
  moment: { consent_type?: string | null } | null | undefined,
): boolean;

export function reviewAskAllowed(
  priorAsks: (string | null | undefined)[] | null | undefined,
  nowMs: number,
): { allowed: boolean; daysAgo: number | null };

export function captureReviewMessage(
  patientName: string | null | undefined,
  reviewUrl: string,
): string;
