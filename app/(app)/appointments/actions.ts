"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { nowIST } from "@/lib/format";
import { normalizeIndianPhone } from "@/lib/validation";
import type { PatientOption } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ApptActionState = { ok?: boolean; error?: string };

export type QuickAddPatientState = {
  ok?: boolean;
  error?: string;
  patient?: PatientOption;
};

// Minimal patient creation for the inline "add new patient" flow inside the
// booking popup. Returns the created row so the caller can auto-select it.
export async function quickAddPatient(input: {
  full_name: string;
  whatsapp_number: string;
  phone?: string;
  area?: string;
}): Promise<QuickAddPatientState> {
  const full_name = input.full_name.trim();
  if (!full_name) return { error: "Name is required." };

  const whatsapp = normalizeIndianPhone(input.whatsapp_number);
  if (!whatsapp) return { error: "Enter a valid 10-digit WhatsApp number." };

  let phone: string | null = null;
  if (input.phone && input.phone.trim()) {
    phone = normalizeIndianPhone(input.phone) ?? input.phone.trim();
  }
  const area = input.area?.trim() || null;

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

  const { data, error } = await supabase
    .from("patients")
    .insert({
      clinic_id: profile.home_clinic_id,
      full_name,
      whatsapp_number: whatsapp,
      phone,
      area,
    })
    .select("id, full_name, whatsapp_number, phone")
    .single();

  if (error || !data) {
    return { error: "Could not add patient. Please try again." };
  }

  revalidatePath("/patients");
  return { ok: true, patient: data as PatientOption };
}

type LoadedAppt = {
  id: string;
  clinic_id: string;
  patient_id: string;
  status: string;
  appointment_date: string;
  appointment_time: string;
  treatment_type_id: string | null;
  doctor: string | null;
  reminder_24h_sent_at: string | null;
  reminder_1h_sent_at: string | null;
  recovery_sent_at: string | null;
  review_requested: boolean;
  patientName: string;
};

async function loadAppt(
  supabase: SupabaseClient,
  id: string,
): Promise<LoadedAppt | null> {
  // RLS scopes this to the caller's clinic.
  const { data } = await supabase
    .from("appointments")
    .select(
      "id, clinic_id, patient_id, status, appointment_date, appointment_time, treatment_type_id, doctor, reminder_24h_sent_at, reminder_1h_sent_at, recovery_sent_at, review_requested, patient:patient_id(full_name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) return null;
  const patient = data.patient as unknown as { full_name: string } | null;
  return {
    id: data.id,
    clinic_id: data.clinic_id,
    patient_id: data.patient_id,
    status: data.status,
    appointment_date: data.appointment_date,
    appointment_time: data.appointment_time,
    treatment_type_id: data.treatment_type_id,
    doctor: data.doctor,
    reminder_24h_sent_at: data.reminder_24h_sent_at,
    reminder_1h_sent_at: data.reminder_1h_sent_at,
    recovery_sent_at: data.recovery_sent_at,
    review_requested: data.review_requested,
    patientName: patient?.full_name ?? "patient",
  };
}

async function setStatus(
  supabase: SupabaseClient,
  id: string,
  status: string,
) {
  return supabase.from("appointments").update({ status }).eq("id", id);
}

// --- Simple linear transitions -------------------------------------------

export async function confirmAppointment(id: string): Promise<ApptActionState> {
  const supabase = createClient();
  const appt = await loadAppt(supabase, id);
  if (!appt) return { error: "Appointment not found." };
  if (appt.status !== "scheduled") {
    return { error: "This action is no longer available." };
  }
  const { error } = await setStatus(supabase, id, "confirmed");
  if (error) return { error: "Could not update. Please try again." };
  revalidatePath("/appointments");
  return { ok: true };
}

export async function arriveAppointment(id: string): Promise<ApptActionState> {
  const supabase = createClient();
  const appt = await loadAppt(supabase, id);
  if (!appt) return { error: "Appointment not found." };
  if (appt.status !== "confirmed") {
    return { error: "This action is no longer available." };
  }
  const { error } = await setStatus(supabase, id, "arrived");
  if (error) return { error: "Could not update. Please try again." };
  revalidatePath("/appointments");
  return { ok: true };
}

export async function inChairAppointment(id: string): Promise<ApptActionState> {
  const supabase = createClient();
  const appt = await loadAppt(supabase, id);
  if (!appt) return { error: "Appointment not found." };
  if (appt.status !== "arrived") {
    return { error: "This action is no longer available." };
  }
  const { error } = await setStatus(supabase, id, "in_chair");
  if (error) return { error: "Could not update. Please try again." };
  revalidatePath("/appointments");
  return { ok: true };
}

// --- Complete (redirects to visit log) -----------------------------------

export async function completeAppointment(id: string): Promise<ApptActionState> {
  const supabase = createClient();
  const appt = await loadAppt(supabase, id);
  if (!appt) return { error: "Appointment not found." };
  if (appt.status !== "arrived" && appt.status !== "in_chair") {
    return { error: "This action is no longer available." };
  }

  const { error } = await setStatus(supabase, id, "completed");
  if (error) return { error: "Could not update. Please try again." };

  await supabase.from("notifications").insert({
    clinic_id: appt.clinic_id,
    type: "system",
    priority: "routine",
    title: `Log visit for ${appt.patientName}`,
    related_patient_id: appt.patient_id,
    action_url: `/visit-log/${id}`,
  });

  revalidatePath("/appointments");
  redirect(`/visit-log/${id}`);
}

// --- No-show (must be in the past) ---------------------------------------

export async function noShowAppointment(id: string): Promise<ApptActionState> {
  const supabase = createClient();
  const appt = await loadAppt(supabase, id);
  if (!appt) return { error: "Appointment not found." };
  if (appt.status !== "scheduled" && appt.status !== "confirmed") {
    return { error: "This action is no longer available." };
  }

  const now = nowIST();
  const isPast =
    appt.appointment_date < now.date ||
    (appt.appointment_date === now.date && appt.appointment_time < now.time);
  if (!isPast) return { error: "Appointment time hasn't passed yet." };

  const { error } = await setStatus(supabase, id, "no_show");
  if (error) return { error: "Could not update. Please try again." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("interactions").insert({
    clinic_id: appt.clinic_id,
    patient_id: appt.patient_id,
    appointment_id: id,
    type: "recovery_noshow",
    channel: "whatsapp",
    sent_by: user?.id ?? null,
  });

  await supabase.from("recovery_events").insert({
    clinic_id: appt.clinic_id,
    patient_id: appt.patient_id,
    recovery_type: "no_show",
    original_appointment_id: id,
    trigger_date: now.date,
  });

  await supabase.from("notifications").insert({
    clinic_id: appt.clinic_id,
    type: "recovery_due",
    priority: "urgent",
    title: `No-show: ${appt.patientName}. Send recovery.`,
    related_patient_id: appt.patient_id,
    action_url: `/patients/${appt.patient_id}`,
  });

  revalidatePath("/appointments");
  return { ok: true };
}

// --- Cancel ---------------------------------------------------------------

export async function cancelAppointment(id: string): Promise<ApptActionState> {
  const supabase = createClient();
  const appt = await loadAppt(supabase, id);
  if (!appt) return { error: "Appointment not found." };
  if (appt.status !== "scheduled" && appt.status !== "confirmed") {
    return { error: "This action is no longer available." };
  }

  const { error } = await setStatus(supabase, id, "cancelled_patient");
  if (error) return { error: "Could not update. Please try again." };

  const now = nowIST();

  await supabase.from("recovery_events").insert({
    clinic_id: appt.clinic_id,
    patient_id: appt.patient_id,
    recovery_type: "cancelled",
    original_appointment_id: id,
    trigger_date: now.date,
  });

  await supabase.from("notifications").insert({
    clinic_id: appt.clinic_id,
    type: "recovery_due",
    priority: "important",
    title: `Cancelled: ${appt.patientName}`,
    related_patient_id: appt.patient_id,
    action_url: `/patients/${appt.patient_id}`,
  });

  revalidatePath("/appointments");
  return { ok: true };
}

// --- Reschedule (mark this rescheduled, create a new scheduled appt) ------

export async function rescheduleAppointment(
  id: string,
  newDate: string,
  newTime: string,
): Promise<ApptActionState> {
  if (!newDate || !newTime) return { error: "Pick a new date and time." };

  const supabase = createClient();
  const appt = await loadAppt(supabase, id);
  if (!appt) return { error: "Appointment not found." };
  if (appt.status === "completed") {
    return { error: "Completed appointments can't be rescheduled." };
  }

  const { error: updateError } = await setStatus(supabase, id, "rescheduled");
  if (updateError) return { error: "Could not update. Please try again." };

  const { error: insertError } = await supabase.from("appointments").insert({
    clinic_id: appt.clinic_id,
    patient_id: appt.patient_id,
    appointment_date: newDate,
    appointment_time: newTime,
    treatment_type_id: appt.treatment_type_id,
    doctor: appt.doctor,
    status: "scheduled",
  });
  if (insertError) return { error: "Could not create the new appointment." };

  revalidatePath("/appointments");
  return { ok: true };
}

// --- Book -----------------------------------------------------------------

export async function bookAppointment(
  _prev: ApptActionState,
  formData: FormData,
): Promise<ApptActionState> {
  const patient_id = String(formData.get("patient_id") ?? "").trim();
  const appointment_date = String(formData.get("appointment_date") ?? "").trim();
  const appointment_time = String(formData.get("appointment_time") ?? "").trim();
  const treatment = String(formData.get("treatment_type_id") ?? "").trim();
  const doctor = String(formData.get("doctor") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!patient_id) return { error: "Select a patient." };
  if (!appointment_date) return { error: "Pick a date." };
  if (!appointment_time) return { error: "Pick a time." };

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

  const { error } = await supabase.from("appointments").insert({
    clinic_id: profile.home_clinic_id,
    patient_id,
    appointment_date,
    appointment_time,
    treatment_type_id: treatment || null,
    doctor: doctor || null,
    notes: notes || null,
    status: "scheduled",
  });

  if (error) return { error: "Could not book appointment. Please try again." };

  revalidatePath("/appointments");
  return { ok: true };
}

// --- WhatsApp actions -----------------------------------------------------
// Each records the send (timestamp/flag + interaction row). The wa.me link is
// opened client-side; these just persist that it happened. Guards enforce the
// anti-duplicate rule so a second click can't double-send.

async function currentUserId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function send24hReminder(id: string): Promise<ApptActionState> {
  const supabase = createClient();
  const appt = await loadAppt(supabase, id);
  if (!appt) return { error: "Appointment not found." };
  if (
    (appt.status !== "scheduled" && appt.status !== "confirmed") ||
    appt.reminder_24h_sent_at
  ) {
    return { error: "This action is no longer available." };
  }

  const { error } = await supabase
    .from("appointments")
    .update({ reminder_24h_sent_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };

  await supabase.from("interactions").insert({
    clinic_id: appt.clinic_id,
    patient_id: appt.patient_id,
    appointment_id: id,
    type: "reminder_24h",
    channel: "whatsapp",
    sent_by: await currentUserId(supabase),
  });

  revalidatePath("/appointments");
  return { ok: true };
}

export async function send1hReminder(id: string): Promise<ApptActionState> {
  const supabase = createClient();
  const appt = await loadAppt(supabase, id);
  if (!appt) return { error: "Appointment not found." };
  if (
    (appt.status !== "scheduled" && appt.status !== "confirmed") ||
    appt.reminder_1h_sent_at
  ) {
    return { error: "This action is no longer available." };
  }

  const { error } = await supabase
    .from("appointments")
    .update({ reminder_1h_sent_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };

  await supabase.from("interactions").insert({
    clinic_id: appt.clinic_id,
    patient_id: appt.patient_id,
    appointment_id: id,
    type: "reminder_1h",
    channel: "whatsapp",
    sent_by: await currentUserId(supabase),
  });

  revalidatePath("/appointments");
  return { ok: true };
}

// Shared body for the two recovery sends (no-show / cancelled).
async function sendRecovery(
  id: string,
  fromStatus: "no_show" | "cancelled_patient",
  interactionType: "recovery_noshow" | "recovery_cancelled",
): Promise<ApptActionState> {
  const supabase = createClient();
  const appt = await loadAppt(supabase, id);
  if (!appt) return { error: "Appointment not found." };
  if (appt.status !== fromStatus || appt.recovery_sent_at) {
    return { error: "This action is no longer available." };
  }

  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("appointments")
    .update({ recovery_sent_at: nowIso, status: "recovery_sent" })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };

  // Mark the recovery_event created when the appointment was marked
  // no-show / cancelled as actioned.
  await supabase
    .from("recovery_events")
    .update({ action_taken_date: nowIST().date, wa_message_sent: true })
    .eq("original_appointment_id", id);

  await supabase.from("interactions").insert({
    clinic_id: appt.clinic_id,
    patient_id: appt.patient_id,
    appointment_id: id,
    type: interactionType,
    channel: "whatsapp",
    sent_by: await currentUserId(supabase),
  });

  revalidatePath("/appointments");
  return { ok: true };
}

export async function recoverNoShow(id: string): Promise<ApptActionState> {
  return sendRecovery(id, "no_show", "recovery_noshow");
}

export async function recoverCancelled(id: string): Promise<ApptActionState> {
  return sendRecovery(id, "cancelled_patient", "recovery_cancelled");
}

export async function requestReview(id: string): Promise<ApptActionState> {
  const supabase = createClient();
  const appt = await loadAppt(supabase, id);
  if (!appt) return { error: "Appointment not found." };
  if (appt.status !== "completed" || appt.review_requested) {
    return { error: "This action is no longer available." };
  }

  const { error } = await supabase
    .from("appointments")
    .update({
      review_requested: true,
      review_requested_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };

  await supabase.from("interactions").insert({
    clinic_id: appt.clinic_id,
    patient_id: appt.patient_id,
    appointment_id: id,
    type: "review_request",
    channel: "whatsapp",
    sent_by: await currentUserId(supabase),
  });

  revalidatePath("/appointments");
  return { ok: true };
}
