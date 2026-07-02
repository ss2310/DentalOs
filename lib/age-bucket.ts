// Age-bucket badge labels + tints, shared by /billing and the patient page.
// current=gray, days_30=amber (warning), days_60=orange, days_90_plus=red.

export type AgeBucket = "current" | "days_30" | "days_60" | "days_90_plus";

export const AGE_BUCKET: Record<AgeBucket, { label: string; badge: string }> = {
  current: { label: "Current", badge: "bg-subtle text-text-secondary" },
  days_30: { label: "30+ days", badge: "bg-warning/10 text-warning" },
  days_60: { label: "60+ days", badge: "bg-orange-100 text-orange-700" },
  days_90_plus: { label: "90+ days", badge: "bg-danger/10 text-danger" },
};
