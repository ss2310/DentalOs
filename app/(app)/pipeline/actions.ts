"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nowIST, formatINR, addDays } from "@/lib/format";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CaseActionState = { ok?: boolean; error?: string };

type LoadedCase = {
  id: string;
  clinic_id: string;
  patient_id: string;
  stage: string;
  plan_value: string;
  treatmentName: string;
  patientName: string;
};

async function loadCase(
  supabase: SupabaseClient,
  id: string,
): Promise<LoadedCase | null> {
  const { data } = await supabase
    .from("case_pipeline")
    .select(
      "id, clinic_id, patient_id, stage, plan_value, patient:patient_id(full_name), treatment:treatment_id(treatment_name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const patient = data.patient as unknown as { full_name: string } | null;
  const treatment = data.treatment as unknown as {
    treatment_name: string;
  } | null;
  return {
    id: data.id,
    clinic_id: data.clinic_id,
    patient_id: data.patient_id,
    stage: data.stage,
    plan_value: data.plan_value,
    treatmentName: treatment?.treatment_name ?? "Treatment",
    patientName: patient?.full_name ?? "patient",
  };
}

async function currentUserId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

// --- Add case ------------------------------------------------------------

export async function addCase(input: {
  patient_id: string;
  treatment_id: string;
  plan_value: number;
  notes?: string;
}): Promise<CaseActionState> {
  if (!input.patient_id) return { error: "Select a patient." };
  if (!input.treatment_id) return { error: "Select a treatment." };
  if (!Number.isFinite(input.plan_value) || input.plan_value < 0) {
    return { error: "Enter a valid plan value." };
  }

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

  const { data: created, error } = await supabase
    .from("case_pipeline")
    .insert({
      clinic_id: profile.home_clinic_id,
      patient_id: input.patient_id,
      treatment_id: input.treatment_id,
      plan_value: input.plan_value,
      stage: "identified",
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !created) {
    return { error: "Could not add case. Please try again." };
  }

  await supabase.from("recovery_events").insert({
    clinic_id: profile.home_clinic_id,
    patient_id: input.patient_id,
    recovery_type: "deferred_treatment",
    original_case_id: created.id,
    trigger_date: nowIST().date,
  });

  revalidatePath("/pipeline");
  return { ok: true };
}

// --- Stage transitions ---------------------------------------------------

export async function presentCase(id: string): Promise<CaseActionState> {
  const supabase = createClient();
  const c = await loadCase(supabase, id);
  if (!c) return { error: "Case not found." };
  if (c.stage !== "identified") {
    return { error: "This action is no longer available." };
  }
  const { error } = await supabase
    .from("case_pipeline")
    .update({ stage: "presented", presented_date: nowIST().date })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };
  revalidatePath("/pipeline");
  return { ok: true };
}

export async function acceptCase(id: string): Promise<CaseActionState> {
  const supabase = createClient();
  const c = await loadCase(supabase, id);
  if (!c) return { error: "Case not found." };
  if (c.stage !== "presented" && c.stage !== "thinking") {
    return { error: "This action is no longer available." };
  }
  const today = nowIST().date;

  const { error } = await supabase
    .from("case_pipeline")
    .update({ stage: "accepted", accepted_date: today })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };

  await supabase.rpc("create_notification", {
    p_clinic_id: c.clinic_id,
    p_type: "case_follow_up",
    p_priority: "important",
    p_title: `${c.treatmentName} accepted ${formatINR(c.plan_value)}. Book appointment.`,
    p_related_patient_id: c.patient_id,
    p_action_url: "/pipeline",
  });

  // Close the linked recovery_event as a win.
  await supabase
    .from("recovery_events")
    .update({
      outcome: "accepted",
      outcome_date: today,
      revenue_recovered: c.plan_value,
    })
    .eq("original_case_id", id);

  revalidatePath("/pipeline");
  return { ok: true };
}

export async function thinkingCase(
  id: string,
  followUpDate: string,
): Promise<CaseActionState> {
  if (!followUpDate) return { error: "Pick a follow-up date." };
  const supabase = createClient();
  const c = await loadCase(supabase, id);
  if (!c) return { error: "Case not found." };
  if (c.stage !== "presented") {
    return { error: "This action is no longer available." };
  }
  const { error } = await supabase
    .from("case_pipeline")
    .update({ stage: "thinking", follow_up_date: followUpDate })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };
  revalidatePath("/pipeline");
  return { ok: true };
}

export async function rejectCase(
  id: string,
  reason: string,
  notes: string,
): Promise<CaseActionState> {
  const supabase = createClient();
  const c = await loadCase(supabase, id);
  if (!c) return { error: "Case not found." };
  if (c.stage !== "presented" && c.stage !== "thinking") {
    return { error: "This action is no longer available." };
  }
  const detail = notes.trim() ? `${reason} — ${notes.trim()}` : reason;
  const today = nowIST().date;

  const { error } = await supabase
    .from("case_pipeline")
    .update({ stage: "rejected", rejection_reason: detail })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };

  await supabase
    .from("recovery_events")
    .update({ outcome: "lost", outcome_date: today })
    .eq("original_case_id", id);

  revalidatePath("/pipeline");
  return { ok: true };
}

export async function markCaseScheduled(id: string): Promise<CaseActionState> {
  const supabase = createClient();
  const c = await loadCase(supabase, id);
  if (!c) return { error: "Case not found." };
  if (c.stage !== "accepted") {
    return { error: "This action is no longer available." };
  }
  const { error } = await supabase
    .from("case_pipeline")
    .update({ stage: "scheduled" })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };
  revalidatePath("/pipeline");
  return { ok: true };
}

export async function followUpCase(id: string): Promise<CaseActionState> {
  const supabase = createClient();
  const c = await loadCase(supabase, id);
  if (!c) return { error: "Case not found." };
  if (c.stage !== "thinking") {
    return { error: "This action is no longer available." };
  }
  const today = nowIST().date;

  const { error } = await supabase
    .from("case_pipeline")
    .update({ last_follow_up: today, follow_up_date: addDays(today, 7) })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };

  await supabase
    .from("recovery_events")
    .update({ action_taken_date: today, wa_message_sent: true })
    .eq("original_case_id", id);

  await supabase.from("interactions").insert({
    clinic_id: c.clinic_id,
    patient_id: c.patient_id,
    type: "case_follow_up",
    channel: "whatsapp",
    sent_by: await currentUserId(supabase),
  });

  revalidatePath("/pipeline");
  return { ok: true };
}
