"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext, writeAudit } from "@/lib/admin/auth";
import { FEATURE_FLAG_KEYS } from "@/lib/admin/feature-flags";

export type AdminSystemState = { ok?: boolean; error?: string };

/**
 * Toggle a GLOBAL feature-flag default (platform-wide, not a single clinic).
 * Re-verifies super-admin (requireAdminContext), validates the key against the
 * registry, upserts feature_flag_defaults via the service-role client, and
 * audits the change. This is the ONLY mutation in the System panel — everything
 * else there is read-only, and this never touches clinic data.
 */
export async function setFeatureFlagDefault(
  flagKey: string,
  enabled: boolean,
): Promise<AdminSystemState> {
  if (!FEATURE_FLAG_KEYS.has(flagKey)) {
    return { error: "Unknown feature flag." };
  }

  const { adminId, db } = await requireAdminContext();

  const { error } = await db
    .from("feature_flag_defaults")
    .upsert(
      { flag_key: flagKey, enabled, updated_at: new Date().toISOString() },
      { onConflict: "flag_key" },
    );
  if (error) {
    console.error("setFeatureFlagDefault failed:", error);
    return { error: "Could not update. Please try again." };
  }

  await writeAudit(
    db,
    adminId,
    "feature_default.set",
    { type: "feature_flag", id: flagKey },
    { enabled },
  );

  revalidatePath("/admin/system");
  return { ok: true };
}
