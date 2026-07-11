"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type WalkInState = { ok?: boolean; error?: string };

/**
 * "Add today's treatment" from the patient profile. One rpc call —
 * log_walk_in_visit() (migration 052) creates a synthetic completed
 * appointment for today and runs the existing log_visit() rails on it
 * (visit_log, outstanding, recovery event, rollups, recall, payment ledger),
 * all in one transaction with clinic_id re-derived server-side.
 */
export async function logWalkInVisit(input: {
  patientId: string;
  treatmentId: string;
  doctor: string;
  cost: number;
  amountPaid: number;
  paymentMode: string;
}): Promise<WalkInState> {
  if (!input.patientId) return { error: "Missing patient." };
  if (!input.treatmentId) return { error: "Select a treatment." };
  if (!Number.isFinite(input.cost) || input.cost < 0) {
    return { error: "Enter a valid treatment cost." };
  }
  if (!Number.isFinite(input.amountPaid) || input.amountPaid < 0) {
    return { error: "Enter a valid amount paid." };
  }
  if (input.amountPaid > input.cost) {
    return { error: "Amount paid cannot exceed the treatment cost." };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc("log_walk_in_visit", {
    p_patient_id: input.patientId,
    p_treatment_id: input.treatmentId,
    p_doctor: input.doctor.trim() || null,
    p_cost: input.cost,
    p_amount_paid: input.amountPaid,
    p_payment_mode: input.paymentMode || "cash",
  });

  if (error) {
    if (/exceed/i.test(error.message ?? "")) {
      return { error: "Amount paid cannot exceed the treatment cost." };
    }
    return { error: "Could not save the visit. Please try again." };
  }

  revalidatePath(`/patients/${input.patientId}`);
  return { ok: true };
}
