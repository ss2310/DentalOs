"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeIndianPhone } from "@/lib/validation";
import {
  deriveConsentType,
  reviewAskAllowed,
  REVIEW_ASK_COOLDOWN_DAYS,
} from "@/lib/capture/consent";

// Moment Capture (S1) server actions. Staff-usable (receptionist + doctor —
// capture is chairside work, unlike the admin-only social module). All
// reads/writes session-scoped (RLS). DPDP rails live here, not the UI:
// no consent → no storage; photos in the private bucket only; the review ask
// is capped at one per patient per 30 days ACROSS surveys, captures, and the
// appointments module's direct review requests.

export type CaptureState = {
  ok?: boolean;
  error?: string;
  momentId?: string;
  reviewAsk?: { allowed: boolean; daysAgo: number | null };
};

const CAPTURE_BUCKET = "capture-photos";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

function extOf(file: File): string | null {
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return null;
}

/** Every review-touch timestamp we know for this patient (30-day cap inputs). */
async function priorReviewAsks(
  supabase: ReturnType<typeof createClient>,
  patientId: string,
): Promise<(string | null)[]> {
  const [surveys, captures, appts] = await Promise.all([
    supabase
      .from("survey_responses")
      .select("sent_at")
      .eq("patient_id", patientId)
      .order("sent_at", { ascending: false })
      .limit(1),
    supabase
      .from("capture_moments")
      .select("review_request_sent_at")
      .eq("patient_id", patientId)
      .not("review_request_sent_at", "is", null)
      .order("review_request_sent_at", { ascending: false })
      .limit(1),
    supabase
      .from("appointments")
      .select("review_requested_at")
      .eq("patient_id", patientId)
      .not("review_requested_at", "is", null)
      .order("review_requested_at", { ascending: false })
      .limit(1),
  ]);
  return [
    (surveys.data?.[0]?.sent_at as string | undefined) ?? null,
    (captures.data?.[0]?.review_request_sent_at as string | undefined) ?? null,
    (appts.data?.[0]?.review_requested_at as string | undefined) ?? null,
  ];
}

/**
 * Save a captured moment: upload photo(s) to the private clinic-scoped bucket,
 * store the consent record, and report whether the review ask is allowed
 * (the client then opens wa.me and calls markCaptureReviewSent). Refuses to
 * store ANYTHING without at least one consent toggle.
 */
export async function saveMoment(formData: FormData): Promise<CaptureState> {
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
  const clinicId = profile?.home_clinic_id;
  if (!clinicId) return { error: "No clinic found for user." };

  // --- consent first: no consent record, nothing stores (DPDP) ---
  const consentReview = formData.get("consent_review") === "true";
  const consentSocial = formData.get("consent_social") === "true";
  const consentType = deriveConsentType(consentReview, consentSocial);
  if (!consentType) {
    return { error: "Pick at least one consent — without it nothing can be saved." };
  }

  // --- patient: existing id, or quick-add name + phone ---
  let patientId = String(formData.get("patient_id") ?? "").trim();
  if (patientId) {
    // The consent record must reference OUR patient: the RLS-scoped read
    // returns null for any other clinic's patient id (a crafted request
    // could otherwise attach the moment to a foreign patient row).
    const { data: owned } = await supabase
      .from("patients")
      .select("id")
      .eq("id", patientId)
      .maybeSingle();
    if (!owned) return { error: "Patient not found." };
  }
  if (!patientId) {
    const name = String(formData.get("new_patient_name") ?? "").trim();
    const phoneRaw = String(formData.get("new_patient_phone") ?? "").trim();
    const phone = normalizeIndianPhone(phoneRaw);
    if (!name || !phone) {
      return { error: "Pick a patient, or add a name and a valid mobile number." };
    }
    const { data: created, error: pErr } = await supabase
      .from("patients")
      .insert({ clinic_id: clinicId, full_name: name, whatsapp_number: phone })
      .select("id")
      .single();
    if (pErr || !created) return { error: "Could not add the patient. Please try again." };
    patientId = created.id as string;
  }

  // --- photos ---
  const after = formData.get("after_photo");
  if (!(after instanceof File) || after.size === 0) {
    return { error: "The result photo is required." };
  }
  const before = formData.get("before_photo");
  const files: { file: File; slot: "after" | "before" }[] = [{ file: after, slot: "after" }];
  if (before instanceof File && before.size > 0) files.push({ file: before, slot: "before" });

  for (const { file } of files) {
    if (!extOf(file)) return { error: "Photos must be JPG, PNG, or WebP." };
    if (file.size > MAX_PHOTO_BYTES) return { error: "Each photo must be under 8 MB." };
  }

  const momentId = randomUUID();
  const paths: Record<string, string> = {};
  for (const { file, slot } of files) {
    const p = `${clinicId}/${momentId}/${slot}.${extOf(file)}`;
    const { error: upErr } = await supabase.storage
      .from(CAPTURE_BUCKET)
      .upload(p, file, { contentType: file.type, upsert: false });
    if (upErr) {
      // best-effort rollback of anything already uploaded
      await supabase.storage.from(CAPTURE_BUCKET).remove(Object.values(paths));
      return { error: "Photo upload failed. Please try again." };
    }
    paths[slot] = p;
  }

  const { error: insErr } = await supabase.from("capture_moments").insert({
    id: momentId,
    clinic_id: clinicId,
    patient_id: patientId,
    treatment: String(formData.get("treatment") ?? "").trim().slice(0, 200) || null,
    after_photo_path: paths.after,
    before_photo_path: paths.before ?? null,
    consent_review: consentReview,
    consent_social: consentSocial,
    consent_type: consentType,
    consent_recorded_by: user.id,
  });
  if (insErr) {
    await supabase.storage.from(CAPTURE_BUCKET).remove(Object.values(paths));
    console.error("capture_moments insert failed:", insErr);
    return { error: "Could not save the moment. Please try again." };
  }

  // Review ask eligibility (cap across surveys + captures + appointments).
  let reviewAsk: CaptureState["reviewAsk"];
  if (consentReview) {
    const asks = await priorReviewAsks(supabase, patientId);
    reviewAsk = reviewAskAllowed(asks, Date.now());
  }

  revalidatePath("/capture/gallery");
  return { ok: true, momentId, reviewAsk };
}

/**
 * Stamp the review ask as sent (single-fire; the client opened wa.me in the
 * same tap). Re-checks consent AND the 30-day cap server-side — a crafted
 * request can't bypass either.
 */
export async function markCaptureReviewSent(momentId: string): Promise<CaptureState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: moment } = await supabase
    .from("capture_moments")
    .select("id, patient_id, consent_review, review_request_sent_at")
    .eq("id", momentId)
    .maybeSingle();
  if (!moment) return { error: "Moment not found." };
  if (!moment.consent_review) {
    return { error: "This patient did not consent to a review request." };
  }
  if (moment.review_request_sent_at) return { ok: true }; // already stamped

  const asks = await priorReviewAsks(supabase, moment.patient_id);
  const gate = reviewAskAllowed(asks, Date.now());
  if (!gate.allowed) {
    return {
      error: `This patient was already asked ${gate.daysAgo} day(s) ago — one ask per ${REVIEW_ASK_COOLDOWN_DAYS} days.`,
    };
  }

  await supabase
    .from("capture_moments")
    .update({ review_request_sent_at: new Date().toISOString() })
    .eq("id", momentId)
    .is("review_request_sent_at", null);

  revalidatePath("/capture/gallery");
  return { ok: true };
}

/** Consent revocation: remove the photos from storage, then the row. */
export async function deleteMoment(momentId: string): Promise<CaptureState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: moment } = await supabase
    .from("capture_moments")
    .select("id, after_photo_path, before_photo_path")
    .eq("id", momentId)
    .maybeSingle();
  if (!moment) return { error: "Moment not found." };

  const paths = [moment.after_photo_path, moment.before_photo_path].filter(
    (p): p is string => !!p,
  );
  if (paths.length > 0) {
    await supabase.storage.from(CAPTURE_BUCKET).remove(paths);
  }
  const { error } = await supabase.from("capture_moments").delete().eq("id", momentId);
  if (error) return { error: "Could not delete. Please try again." };

  revalidatePath("/capture/gallery");
  return { ok: true };
}
