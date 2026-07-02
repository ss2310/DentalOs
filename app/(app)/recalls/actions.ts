"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nowIST } from "@/lib/format";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RecallActionState = { ok?: boolean; error?: string };

type LoadedRecall = {
  id: string;
  clinic_id: string;
  patient_id: string;
  status: string;
};

async function loadRecall(
  supabase: SupabaseClient,
  id: string,
): Promise<LoadedRecall | null> {
  const { data } = await supabase
    .from("recalls")
    .select("id, clinic_id, patient_id, status")
    .eq("id", id)
    .maybeSingle();
  return (data as LoadedRecall) ?? null;
}

const ACTIVE = ["pending", "reminded"];

export async function remindRecall(id: string): Promise<RecallActionState> {
  const supabase = createClient();
  const r = await loadRecall(supabase, id);
  if (!r) return { error: "Recall not found." };
  if (!ACTIVE.includes(r.status)) {
    return { error: "This action is no longer available." };
  }

  const { error } = await supabase
    .from("recalls")
    .update({ status: "reminded", reminder_sent_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from("interactions").insert({
    clinic_id: r.clinic_id,
    patient_id: r.patient_id,
    type: "recall_reminder",
    channel: "whatsapp",
    sent_by: user?.id ?? null,
  });

  revalidatePath("/recalls");
  return { ok: true };
}

export async function markRecallScheduled(
  id: string,
): Promise<RecallActionState> {
  const supabase = createClient();
  const r = await loadRecall(supabase, id);
  if (!r) return { error: "Recall not found." };
  if (!ACTIVE.includes(r.status)) {
    return { error: "This action is no longer available." };
  }
  const { error } = await supabase
    .from("recalls")
    .update({ status: "scheduled" })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };
  revalidatePath("/recalls");
  return { ok: true };
}

export async function completeRecall(id: string): Promise<RecallActionState> {
  const supabase = createClient();
  const r = await loadRecall(supabase, id);
  if (!r) return { error: "Recall not found." };
  if (!["pending", "reminded", "scheduled"].includes(r.status)) {
    return { error: "This action is no longer available." };
  }
  const { error } = await supabase
    .from("recalls")
    .update({ status: "completed", completed_date: nowIST().date })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };
  revalidatePath("/recalls");
  return { ok: true };
}

export async function dismissRecall(id: string): Promise<RecallActionState> {
  const supabase = createClient();
  const r = await loadRecall(supabase, id);
  if (!r) return { error: "Recall not found." };
  if (!ACTIVE.includes(r.status)) {
    return { error: "This action is no longer available." };
  }
  const { error } = await supabase
    .from("recalls")
    .update({ status: "dismissed" })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };
  revalidatePath("/recalls");
  return { ok: true };
}
