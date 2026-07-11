"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PlanActionState = { ok?: boolean; error?: string };

export type PlanItem = { name: string; cost: number };

/** Final plan value: the per-patient override when given (package price /
 *  discount), else the items sum. */
function resolveTotal(items: PlanItem[], override?: number): number {
  const sum = items.reduce((s, i) => s + i.cost, 0);
  if (override === undefined || override === null) return sum;
  const n = Number(override);
  return Number.isFinite(n) && n > 0 ? n : sum;
}

export async function createTreatmentPlan(input: {
  patientId: string;
  planName: string;
  items: PlanItem[];
  /** Optional per-patient total override (e.g. package discount). */
  total?: number;
}): Promise<PlanActionState> {
  const planName = input.planName.trim();
  if (!planName) return { error: "Give the plan a name." };

  const items = (input.items ?? [])
    .map((i) => ({ name: String(i.name ?? "").trim(), cost: Number(i.cost) || 0 }))
    .filter((i) => i.name);
  if (items.length === 0) return { error: "Add at least one treatment." };

  const total = resolveTotal(items, input.total);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("home_clinic_id")
    .eq("id", user.id)
    .single();
  if (!profile?.home_clinic_id) return { error: "No clinic found for user." };

  const { error } = await supabase.from("treatment_plans").insert({
    clinic_id: profile.home_clinic_id,
    patient_id: input.patientId,
    plan_name: planName,
    items,
    total_cost: total,
    sent_to_patient: false,
  });
  if (error) return { error: "Could not save the plan. Please try again." };

  revalidatePath(`/patients/${input.patientId}`);
  return { ok: true };
}

/**
 * Edit an existing plan (052): rename / add / remove / reprice items. The
 * total is recomputed server-side and `sent_to_patient` resets to false —
 * an edited plan is a new proposal, so staff can (and should) re-send it.
 */
export async function updateTreatmentPlan(input: {
  planId: string;
  patientId: string;
  planName: string;
  items: PlanItem[];
  /** Optional per-patient total override (e.g. package discount). */
  total?: number;
}): Promise<PlanActionState> {
  const planName = input.planName.trim();
  if (!planName) return { error: "Give the plan a name." };

  const items = (input.items ?? [])
    .map((i) => ({ name: String(i.name ?? "").trim(), cost: Number(i.cost) || 0 }))
    .filter((i) => i.name);
  if (items.length === 0) return { error: "Add at least one treatment." };

  const total = resolveTotal(items, input.total);

  const supabase = createClient();
  const { error } = await supabase
    .from("treatment_plans")
    .update({
      plan_name: planName,
      items,
      total_cost: total,
      sent_to_patient: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.planId);
  if (error) return { error: "Could not update the plan. Please try again." };

  revalidatePath(`/patients/${input.patientId}`);
  return { ok: true };
}

/** Anti-duplicate: mark the plan sent once its WhatsApp link is opened. */
export async function markPlanSent(
  planId: string,
  patientId: string,
): Promise<PlanActionState> {
  const supabase = createClient();
  const { error } = await supabase
    .from("treatment_plans")
    .update({ sent_to_patient: true })
    .eq("id", planId);
  if (error) return { error: "Could not update. Please try again." };

  revalidatePath(`/patients/${patientId}`);
  return { ok: true };
}
