"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext, writeAudit } from "@/lib/admin/auth";
import { multiVerticalEnabled } from "@/lib/multi-vertical-access";

export type AdminVerticalState = { ok?: boolean; error?: string };

/**
 * Activate / deactivate a vertical (platform-owner only). Uses the service-role
 * client via requireAdminContext (verticals has no client write policy) and
 * audits every change. Gated by the multi-vertical flag — a no-op when off — and
 * refuses to deactivate 'dental', which is the baseline default for
 * clinics.vertical.
 */
export async function setVerticalActive(
  slug: string,
  active: boolean,
): Promise<AdminVerticalState> {
  if (!multiVerticalEnabled()) {
    return { error: "Multi-vertical is not enabled." };
  }
  const id = String(slug ?? "").trim();
  if (!id) return { error: "Unknown vertical." };
  if (id === "dental" && !active) {
    return { error: "Dental can't be deactivated — it's the default vertical." };
  }

  const { adminId, db } = await requireAdminContext();

  const { error } = await db
    .from("verticals")
    .update({ is_active: active })
    .eq("id", id);
  if (error) {
    console.error("setVerticalActive failed:", error);
    return { error: "Could not update. Please try again." };
  }

  await writeAudit(
    db,
    adminId,
    "vertical.set_active",
    { type: "vertical", id },
    { active },
  );

  revalidatePath("/admin/verticals");
  return { ok: true };
}
