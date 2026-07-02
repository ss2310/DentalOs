"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PaymentState = { ok?: boolean; error?: string };

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function recordPayment(
  outstandingId: string,
  amount: number,
  mode: string,
): Promise<PaymentState> {
  if (!outstandingId) return { error: "Missing record." };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a valid amount." };
  }

  const supabase = createClient();
  // Atomic: outstanding + patient rollups + recovery_event in one txn.
  const { error } = await supabase.rpc("record_payment", {
    p_outstanding_id: outstandingId,
    p_amount: amount,
    p_payment_mode: mode || "cash",
  });

  if (error) {
    if (/exceeds/i.test(error.message ?? "")) {
      return { error: "Amount exceeds the balance due." };
    }
    return { error: "Could not record payment. Please try again." };
  }

  revalidatePath("/billing");
  return { ok: true };
}

export async function remindPayment(
  outstandingId: string,
): Promise<PaymentState> {
  const supabase = createClient();

  // RLS-scoped load; verify + enforce the 7-day anti-duplicate window.
  const { data: o } = await supabase
    .from("outstandings")
    .select("id, clinic_id, patient_id, payment_reminder_sent_at")
    .eq("id", outstandingId)
    .maybeSingle();
  if (!o) return { error: "Outstanding not found." };

  if (
    o.payment_reminder_sent_at &&
    Date.now() - new Date(o.payment_reminder_sent_at).getTime() < SEVEN_DAYS_MS
  ) {
    return { error: "A reminder was already sent in the last 7 days." };
  }

  const { error } = await supabase
    .from("outstandings")
    .update({ payment_reminder_sent_at: new Date().toISOString() })
    .eq("id", outstandingId);
  if (error) return { error: "Could not send reminder. Please try again." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("interactions").insert({
    clinic_id: o.clinic_id,
    patient_id: o.patient_id,
    type: "payment_reminder",
    channel: "whatsapp",
    sent_by: user?.id ?? null,
  });

  revalidatePath("/billing");
  return { ok: true };
}
