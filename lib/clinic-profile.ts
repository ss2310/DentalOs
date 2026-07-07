// Profile-completeness contract shared by the middleware gate, the settings
// form, and the dashboard setup checklist. Pure TS (edge-safe, no imports).
//
// These six fields are what content generation, wa.me messaging, and local
// SEO copy all assume exist — an owner/doctor account can't use the app
// meaningfully without them, so the middleware walks admins to /settings
// until they're filled. Receptionists are never gated (they can't open
// /settings; their owner completes setup).

export const REQUIRED_CLINIC_FIELDS = [
  "business_name",
  "doctor_name",
  "phone",
  "city",
  "area",
  "address",
] as const;

export type RequiredClinicField = (typeof REQUIRED_CLINIC_FIELDS)[number];

export type ClinicProfileFields = Partial<
  Record<RequiredClinicField, string | null>
>;

export function missingProfileFields(
  clinic: ClinicProfileFields | null | undefined,
): RequiredClinicField[] {
  if (!clinic) return [...REQUIRED_CLINIC_FIELDS];
  return REQUIRED_CLINIC_FIELDS.filter(
    (f) => !String(clinic[f] ?? "").trim(),
  );
}

export function isProfileComplete(
  clinic: ClinicProfileFields | null | undefined,
): boolean {
  return missingProfileFields(clinic).length === 0;
}
