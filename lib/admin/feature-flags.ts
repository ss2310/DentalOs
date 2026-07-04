// Registry of per-clinic feature flags editable in the admin panel. Client-safe
// (no server-only imports): used by the detail page + the toggle client + the
// server action's allow-list. A flag is "on" only when present and true in
// clinics.feature_flags. Enforcement wiring across the app is future work — the
// foundation only stores + toggles.

export type FeatureFlagKey =
  | "campaigns"
  | "ai_visibility"
  | "prospecting"
  | "upi_payments"
  | "insight_reports"
  | "map_rank";

export const FEATURE_FLAGS: {
  key: FeatureFlagKey;
  label: string;
  help: string;
}[] = [
  { key: "campaigns", label: "Campaigns", help: "WhatsApp retention campaigns." },
  { key: "ai_visibility", label: "AI Visibility", help: "AI search visibility tools." },
  { key: "prospecting", label: "Prospecting", help: "Agency prospect audits." },
  { key: "upi_payments", label: "UPI Payment Links", help: "UPI payment requests on billing." },
  { key: "insight_reports", label: "Insight Reports", help: "Monthly AI insight report." },
  { key: "map_rank", label: "Map Rank Tracker", help: "Google Maps grid rank scans." },
];

export const FEATURE_FLAG_KEYS = new Set<string>(FEATURE_FLAGS.map((f) => f.key));

/** A flag is enabled only when present and strictly true. */
export function flagOn(
  flags: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  return flags?.[key] === true;
}
