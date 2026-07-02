"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeIndianPhone } from "@/lib/validation";
import type { SupabaseClient } from "@supabase/supabase-js";

export type LeadActionState = {
  ok?: boolean;
  error?: string;
  patientId?: string;
};

type LoadedLead = {
  id: string;
  clinic_id: string;
  name: string;
  phone: string | null;
  status: string;
};

async function loadLead(
  supabase: SupabaseClient,
  id: string,
): Promise<LoadedLead | null> {
  const { data } = await supabase
    .from("lead_logs")
    .select("id, clinic_id, name, phone, status")
    .eq("id", id)
    .maybeSingle();
  return (data as LoadedLead) ?? null;
}

async function clinicId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("home_clinic_id")
    .eq("id", user.id)
    .single();
  return data?.home_clinic_id ?? null;
}

export async function addLead(input: {
  name: string;
  phone: string;
  source: string;
  treatment_interest: string;
  notes: string;
}): Promise<LeadActionState> {
  const name = input.name.trim();
  if (!name) return { error: "Name is required." };

  const supabase = createClient();
  const clinic = await clinicId(supabase);
  if (!clinic) return { error: "No clinic found for user." };

  const { error } = await supabase.from("lead_logs").insert({
    clinic_id: clinic,
    name,
    phone: input.phone.trim() || null,
    source: input.source || "other",
    treatment_interest: input.treatment_interest.trim() || null,
    notes: input.notes.trim() || null,
    status: "new",
  });
  if (error) return { error: "Could not add lead. Please try again." };

  revalidatePath("/leads");
  return { ok: true };
}

async function setStatus(
  id: string,
  from: string[],
  status: string,
): Promise<LeadActionState> {
  const supabase = createClient();
  const lead = await loadLead(supabase, id);
  if (!lead) return { error: "Lead not found." };
  if (!from.includes(lead.status)) {
    return { error: "This action is no longer available." };
  }
  const { error } = await supabase
    .from("lead_logs")
    .update({ status })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };
  revalidatePath("/leads");
  return { ok: true };
}

export async function contactLead(id: string): Promise<LeadActionState> {
  // Note: no interaction row — interactions.patient_id is NOT NULL and a lead
  // has no patient yet. The contact is reflected by the status change.
  return setStatus(id, ["new"], "contacted");
}

export async function interestedLead(id: string): Promise<LeadActionState> {
  return setStatus(id, ["new", "contacted"], "interested");
}

export async function bookLead(id: string): Promise<LeadActionState> {
  // Booking needs a patient; keep it simple — just mark the lead booked.
  return setStatus(id, ["interested"], "booked");
}

export async function lostLead(
  id: string,
  reason: string,
): Promise<LeadActionState> {
  const supabase = createClient();
  const lead = await loadLead(supabase, id);
  if (!lead) return { error: "Lead not found." };
  if (lead.status === "converted" || lead.status === "lost") {
    return { error: "This action is no longer available." };
  }
  const { error } = await supabase
    .from("lead_logs")
    .update({ status: "lost", lost_reason: reason.trim() || null })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };
  revalidatePath("/leads");
  return { ok: true };
}

export async function convertLead(id: string): Promise<LeadActionState> {
  const supabase = createClient();
  const lead = await loadLead(supabase, id);
  if (!lead) return { error: "Lead not found." };
  if (lead.status !== "booked" && lead.status !== "interested") {
    return { error: "This action is no longer available." };
  }

  const whatsapp = lead.phone ? normalizeIndianPhone(lead.phone) : null;

  const { data: patient, error: patientError } = await supabase
    .from("patients")
    .insert({
      clinic_id: lead.clinic_id,
      full_name: lead.name,
      whatsapp_number: whatsapp ?? lead.phone,
      phone: lead.phone,
    })
    .select("id")
    .single();
  if (patientError || !patient) {
    return { error: "Could not create patient. Please try again." };
  }

  const { error: updateError } = await supabase
    .from("lead_logs")
    .update({ status: "converted", converted_to_patient_id: patient.id })
    .eq("id", id);
  if (updateError) {
    return { error: "Patient created but lead update failed." };
  }

  revalidatePath("/leads");
  revalidatePath(`/patients/${patient.id}`);
  return { ok: true, patientId: patient.id };
}
