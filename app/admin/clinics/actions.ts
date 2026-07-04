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

// ---------------------------------------------------------------------------
// Super-admin billing actions. Each re-verifies super-admin (requireAdminContext),
// runs the matching atomic admin_* SECURITY DEFINER function (which writes a
// billing_events row with actor), then records an admin_audit entry. The DB
// functions are service-role-only, so a normal clinic user can never reach them.
// ---------------------------------------------------------------------------

/** Mark a hand-sold clinic as paid: activate a plan + top up its credits. */
export async function activatePlan(
  clinicId: string,
  planId: string,
): Promise<AdminActionState> {
  if (!clinicId || !planId) return { error: "Pick a plan first." };
  const { adminId, db } = await requireAdminContext();

  const { error } = await db.rpc("admin_activate_plan", {
    p_clinic: clinicId,
    p_plan: planId,
    p_actor: adminId,
  });
  if (error) {
    console.error("admin_activate_plan failed:", error);
    return { error: "Could not activate the plan. Please try again." };
  }

  await writeAudit(db, adminId, "billing.activate_plan", { type: "clinic", id: clinicId }, {
    plan_id: planId,
  });
  revalidatePath(`/admin/clinics/${clinicId}`);
  return { ok: true };
}

/** Grant content/map credits (positive admin_adjust ledger entry). */
export async function grantCredits(
  clinicId: string,
  kind: "content" | "map",
  amount: number,
): Promise<AdminActionState> {
  if (!clinicId) return { error: "Missing clinic." };
  if (kind !== "content" && kind !== "map") return { error: "Invalid credit kind." };
  if (!Number.isInteger(amount) || amount <= 0) {
    return { error: "Enter a whole number greater than zero." };
  }
  const { adminId, db } = await requireAdminContext();

  const { error } = await db.rpc("admin_grant_credits", {
    p_clinic: clinicId,
    p_kind: kind,
    p_amount: amount,
    p_actor: adminId,
  });
  if (error) {
    console.error("admin_grant_credits failed:", error);
    return { error: "Could not grant credits. Please try again." };
  }

  await writeAudit(db, adminId, "billing.grant_credits", { type: "clinic", id: clinicId }, {
    kind,
    amount,
  });
  revalidatePath(`/admin/clinics/${clinicId}`);
  return { ok: true };
}

/** Add N days to the clinic's trial (reopens a lapsed trial if now in future). */
export async function extendTrial(
  clinicId: string,
  days: number,
): Promise<AdminActionState> {
  if (!clinicId) return { error: "Missing clinic." };
  if (!Number.isInteger(days) || days <= 0) {
    return { error: "Enter a whole number of days greater than zero." };
  }
  const { adminId, db } = await requireAdminContext();

  const { error } = await db.rpc("admin_extend_trial", {
    p_clinic: clinicId,
    p_days: days,
    p_actor: adminId,
  });
  if (error) {
    console.error("admin_extend_trial failed:", error);
    return { error: "Could not extend the trial. Please try again." };
  }

  await writeAudit(db, adminId, "billing.extend_trial", { type: "clinic", id: clinicId }, {
    days,
  });
  revalidatePath(`/admin/clinics/${clinicId}`);
  return { ok: true };
}

/** Change the plan tier only (no credit/period change). */
export async function changePlan(
  clinicId: string,
  planId: string,
): Promise<AdminActionState> {
  if (!clinicId || !planId) return { error: "Pick a plan first." };
  const { adminId, db } = await requireAdminContext();

  const { error } = await db.rpc("admin_change_plan", {
    p_clinic: clinicId,
    p_plan: planId,
    p_actor: adminId,
  });
  if (error) {
    console.error("admin_change_plan failed:", error);
    return { error: "Could not change the plan. Please try again." };
  }

  await writeAudit(db, adminId, "billing.change_plan", { type: "clinic", id: clinicId }, {
    plan_id: planId,
  });
  revalidatePath(`/admin/clinics/${clinicId}`);
  return { ok: true };
}

/** Deactivate (false) or reactivate (true) a clinic. */
export async function setClinicActive(
  clinicId: string,
  active: boolean,
): Promise<AdminActionState> {
  if (!clinicId) return { error: "Missing clinic." };
  const { adminId, db } = await requireAdminContext();

  const { error } = await db.rpc("admin_set_status", {
    p_clinic: clinicId,
    p_active: active,
    p_actor: adminId,
  });
  if (error) {
    console.error("admin_set_status failed:", error);
    return { error: "Could not update the account. Please try again." };
  }

  await writeAudit(
    db,
    adminId,
    active ? "billing.reactivate" : "billing.deactivate",
    { type: "clinic", id: clinicId },
  );
  revalidatePath(`/admin/clinics/${clinicId}`);
  return { ok: true };
}
