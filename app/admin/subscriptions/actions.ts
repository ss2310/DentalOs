"use server";

import { revalidatePath } from "next/cache";
import { requireAdminContext, writeAudit } from "@/lib/admin/auth";

export type AdminBillingState = { ok?: boolean; error?: string };

/**
 * Confirm a pending manual payment: activates the plan / applies the top-up
 * atomically via confirm_billing_event (service-role only), then audits it.
 * Re-verifies super-admin independently (requireAdminContext) — never trusts the
 * route guard alone.
 */
export async function confirmPayment(
  eventId: string,
): Promise<AdminBillingState> {
  if (!eventId) return { error: "Missing payment." };

  const { adminId, db } = await requireAdminContext();

  const { error } = await db.rpc("confirm_billing_event", {
    p_event_id: eventId,
    p_actor: adminId,
  });
  if (error) {
    console.error("confirm_billing_event failed:", error);
    return { error: "Could not confirm this payment. Please try again." };
  }

  await writeAudit(db, adminId, "billing.confirm", {
    type: "billing_event",
    id: eventId,
  });

  revalidatePath("/admin/subscriptions");
  return { ok: true };
}

/** Mark a pending order cancelled (never charges / grants anything). Audited. */
export async function cancelPending(
  eventId: string,
): Promise<AdminBillingState> {
  if (!eventId) return { error: "Missing payment." };

  const { adminId, db } = await requireAdminContext();

  const { error } = await db
    .from("billing_events")
    .update({ status: "cancelled", actor: adminId })
    .eq("id", eventId)
    .eq("status", "pending");
  if (error) {
    console.error("cancelPending failed:", error);
    return { error: "Could not cancel this payment. Please try again." };
  }

  await writeAudit(db, adminId, "billing.cancel", {
    type: "billing_event",
    id: eventId,
  });

  revalidatePath("/admin/subscriptions");
  return { ok: true };
}
