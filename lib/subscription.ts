// Pure subscription-status helpers shared by the middleware gate, the app-shell
// banner, and the /upgrade + Settings → Billing pages. No imports (safe in the
// Edge middleware runtime): just the status vocabulary + effective-status logic.

export type SubscriptionStatus =
  | "trial"
  | "active"
  | "past_due"
  | "deactivated"
  | "cancelled";

/**
 * The status the app should ACT on. An expired-but-still-'trial' clinic is
 * treated as 'past_due' (banner, full access) so the past_due path is live
 * without a cron flipping the column. Everything else passes through as-is.
 */
export function effectiveStatus(
  status: string | null | undefined,
  trialEndsAt: string | null | undefined,
  now: Date = new Date(),
): SubscriptionStatus {
  const s = (status ?? "active") as SubscriptionStatus;
  if (s === "trial" && trialEndsAt && new Date(trialEndsAt).getTime() < now.getTime()) {
    return "past_due";
  }
  return s;
}

/** Locked out — only /upgrade + /settings reachable. */
export function isBlockedStatus(s: SubscriptionStatus): boolean {
  return s === "deactivated" || s === "cancelled";
}

/** Trial ended, still usable — show the persistent upgrade banner. */
export function isPastDueStatus(s: SubscriptionStatus): boolean {
  return s === "past_due";
}

/** Whole-days remaining in the trial (0 if past/none). */
export function trialDaysLeft(
  trialEndsAt: string | null | undefined,
  now: Date = new Date(),
): number {
  if (!trialEndsAt) return 0;
  const ms = new Date(trialEndsAt).getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
}

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial: "Free trial",
  active: "Active",
  past_due: "Trial ended",
  deactivated: "Deactivated",
  cancelled: "Cancelled",
};

export function statusLabel(s: SubscriptionStatus): string {
  return STATUS_LABELS[s] ?? s;
}
