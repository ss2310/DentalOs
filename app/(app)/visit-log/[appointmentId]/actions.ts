"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type VisitLogState = {
  ok?: boolean;
  error?: string;
  patientId?: string;
};

export async function logVisit(
  _prev: VisitLogState,
  formData: FormData,
): Promise<VisitLogState> {
  const appointment_id = String(formData.get("appointment_id") ?? "").trim();
  const treatment_id = String(formData.get("treatment_id") ?? "").trim();
  const doctor = String(formData.get("doctor") ?? "").trim();
  const cost = Number(formData.get("cost"));
  const amount_paid = Number(formData.get("amount_paid"));
  const payment_mode = String(formData.get("payment_mode") ?? "cash") || "cash";

  if (!appointment_id) return { error: "Missing appointment." };
  if (!treatment_id) return { error: "Select a treatment." };
  if (!Number.isFinite(cost) || cost < 0) {
    return { error: "Enter a valid treatment cost." };
  }
  if (!Number.isFinite(amount_paid) || amount_paid < 0) {
    return { error: "Enter a valid amount paid." };
  }
  if (amount_paid > cost) {
    return { error: "Amount paid cannot exceed the treatment cost." };
  }

  const supabase = createClient();

  // All 6 steps run in one transaction inside log_visit() (see migration
  // 002). A single rpc call — atomic, RLS-safe (clinic re-derived server-side).
  const { data, error } = await supabase.rpc("log_visit", {
    p_appointment_id: appointment_id,
    p_treatment_id: treatment_id,
    p_doctor: doctor || null,
    p_cost: cost,
    p_amount_paid: amount_paid,
    p_payment_mode: payment_mode,
  });

  if (error) {
    const msg = error.message ?? "";
    if (/already logged/i.test(msg)) {
      return { error: "A visit has already been logged for this appointment." };
    }
    if (/exceed/i.test(msg)) {
      return { error: "Amount paid cannot exceed the treatment cost." };
    }
    return { error: "Could not save the visit. Please try again." };
  }

  const patientId = data as string;
  revalidatePath(`/patients/${patientId}`);
  return { ok: true, patientId };
}
