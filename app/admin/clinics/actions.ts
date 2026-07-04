"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext, writeAudit } from "@/lib/admin/auth";
import { FEATURE_FLAG_KEYS } from "@/lib/admin/feature-flags";

export type AdminActionState = { ok?: boolean; error?: string };

/**
 * Toggle one per-clinic feature flag. Re-verifies super-admin independently
 * (requireAdminContext), validates the key against the registry, merges into
 * clinics.feature_flags via the service-role client, and audits the change.
 */
export async function setClinicFeatureFlag(
  clinicId: string,
  flagKey: string,
  enabled: boolean,
): Promise<AdminActionState> {
  if (!FEATURE_FLAG_KEYS.has(flagKey)) {
    return { error: "Unknown feature flag." };
  }

  const { adminId, db } = await requireAdminContext();

  const { data: clinic } = await db
    .from("clinics")
    .select("feature_flags")
    .eq("id", clinicId)
    .maybeSingle();
  if (!clinic) return { error: "Clinic not found." };

  const flags = {
    ...((clinic.feature_flags as Record<string, unknown>) ?? {}),
    [flagKey]: enabled,
  };

  const { error } = await db
    .from("clinics")
    .update({ feature_flags: flags })
    .eq("id", clinicId);
  if (error) {
    console.error("setClinicFeatureFlag failed:", error);
    return { error: "Could not update. Please try again." };
  }

  await writeAudit(db, adminId, "feature_flag.set", { type: "clinic", id: clinicId }, {
    flag: flagKey,
    enabled,
  });

  revalidatePath(`/admin/clinics/${clinicId}`);
  return { ok: true };
}
