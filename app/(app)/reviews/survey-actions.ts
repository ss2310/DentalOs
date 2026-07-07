"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";

export type SurveyActionState = { ok?: boolean; error?: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates a survey_response row for a completed appointment and returns ok so
 * the client can proceed. The token is generated on the client (so the wa.me
 * link can open synchronously on click) and passed in; we persist it here.
 * Anti-duplicate: one survey per appointment.
 */
export async function sendSurvey(
  appointmentId: string,
  token: string,
): Promise<SurveyActionState> {
  if (!UUID_RE.test(token)) return { error: "Invalid survey link." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // RLS scopes this to the caller's clinic.
  const { data: appt } = await supabase
    .from("appointments")
    .select("id, clinic_id, patient_id, status")
    .eq("id", appointmentId)
    .maybeSingle();
  if (!appt) return { error: "Appointment not found." };
  if (appt.status !== "completed") {
    return { error: "Surveys can only be sent for completed visits." };
  }

  // One survey per appointment (anti-duplicate).
  const { data: existing } = await supabase
    .from("survey_responses")
    .select("id")
    .eq("appointment_id", appointmentId)
    .maybeSingle();
  if (existing) return { error: "A survey was already sent for this visit." };

  // Link the visit log if this appointment produced one (optional).
  const { data: visit } = await supabase
    .from("visit_logs")
    .select("id")
    .eq("appointment_id", appointmentId)
    .maybeSingle();

  const { error } = await supabase.from("survey_responses").insert({
    clinic_id: appt.clinic_id,
    patient_id: appt.patient_id,
    appointment_id: appointmentId,
    visit_log_id: visit?.id ?? null,
    survey_token: token,
  });
  if (error) {
    console.error("sendSurvey insert failed:", error);
    return { error: "Could not create the survey. Please try again." };
  }

  revalidatePath("/reviews");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Closes out a low-score complaint: flips its linked urgent notification to
 * 'acted_on' via the SECURITY DEFINER RPC (which also keeps the unread badge in
 * sync). Admin-only, mirroring the other review-management guards.
 */
export async function markSurveyHandled(
  surveyId: string,
): Promise<SurveyActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!isAdminRole(await getUserRole())) {
    return { error: "Only an owner or doctor can mark complaints handled." };
  }

  const { error } = await supabase.rpc("mark_survey_handled", {
    p_survey_id: surveyId,
  });
  if (error) {
    console.error("mark_survey_handled failed:", error);
    return { error: "Could not update. Please try again." };
  }

  revalidatePath("/reviews");
  revalidatePath("/dashboard");
  return { ok: true };
}
