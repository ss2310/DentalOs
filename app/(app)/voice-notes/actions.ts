"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { VOICE_BUCKET, NOTE_CLIENT_COLS } from "@/lib/voice-notes";
import { extractNote } from "@/lib/agent/notes-agent";
import {
  RECALL_TYPES,
  type ClinicNote,
  type FollowupTask,
  type NoteExtraction,
  type RecallType,
} from "@/lib/types";

// Mutations for the voice-note cards. Every read/write is RLS-scoped to the
// caller's clinic (the note id alone is never trusted). These are intentionally
// NOT gated on the `voice_notes` flag: if an owner turns the feature off, staff
// must still be able to finish reviewing / clearing notes already captured.

type NoteResult = { note?: ClinicNote; error?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function cleanTags(tags: unknown): string[] {
  return Array.isArray(tags)
    ? tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 20)
    : [];
}

/** Normalise the (edited) proposal before it becomes the confirmed record. */
function sanitizeExtraction(e: NoteExtraction): NoteExtraction {
  const followups = Array.isArray(e.followups)
    ? e.followups
        .map((f) => ({
          description: String(f?.description ?? "").trim().slice(0, 500),
          due_date: DATE_RE.test(String(f?.due_date ?? "")) ? f.due_date : null,
        }))
        .filter((f) => f.description)
        .slice(0, 20)
    : [];
  const recall =
    e.recall &&
    RECALL_TYPES.includes(e.recall.recall_type as RecallType) &&
    DATE_RE.test(String(e.recall.due_date))
      ? { recall_type: e.recall.recall_type as RecallType, due_date: e.recall.due_date }
      : null;
  const appointment =
    e.appointment &&
    DATE_RE.test(String(e.appointment.date)) &&
    TIME_RE.test(String(e.appointment.time))
      ? {
          date: e.appointment.date,
          time: e.appointment.time,
          reason: e.appointment.reason
            ? String(e.appointment.reason).trim().slice(0, 200)
            : null,
        }
      : null;
  return {
    cleaned_note: String(e.cleaned_note ?? "").trim(),
    tags: cleanTags(e.tags),
    followups,
    recall,
    appointment,
    review_requested: e.review_requested === true,
  };
}

/**
 * Save the reviewed, possibly-edited extraction and confirm the note. This is
 * where the staged proposal is MATERIALIZED: follow-ups become followup_tasks
 * rows and a recall becomes a real recalls row (via the confirm_note_recall
 * definer fn). Re-runs nothing. Audio is purged — the transcript is the record.
 */
export async function confirmNote(
  id: string,
  edited: NoteExtraction,
): Promise<NoteResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: existing } = await supabase
    .from("clinic_notes")
    .select("id, patient_id, audio_path")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { error: "Note not found." };

  const ext = sanitizeExtraction(edited);
  if (!ext.cleaned_note) return { error: "The note text can't be empty." };

  const { data: note, error } = await supabase
    .from("clinic_notes")
    .update({
      note_text: ext.cleaned_note,
      tags: ext.tags,
      extraction: ext,
      status: "confirmed",
      audio_path: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(NOTE_CLIENT_COLS)
    .single();
  if (error || !note) return { error: "Could not save the note." };

  // --- Materialize the staged proposal ---
  // Follow-ups → followup_tasks (RLS insert, clinic derived from the session).
  if (ext.followups.length > 0) {
    const { error: fErr } = await supabase.from("followup_tasks").insert(
      ext.followups.map((f) => ({
        note_id: id,
        patient_id: existing.patient_id,
        description: f.description,
        due_date: f.due_date,
      })),
    );
    if (fErr) console.error("followup_tasks insert failed:", fErr);
  }
  // Recall → recalls (needs a patient; via the SECURITY DEFINER helper).
  if (ext.recall && existing.patient_id) {
    const { error: rErr } = await supabase.rpc("confirm_note_recall", {
      p_patient: existing.patient_id,
      p_type: ext.recall.recall_type,
      p_due: ext.recall.due_date,
    });
    if (rErr) console.error("confirm_note_recall failed:", rErr);
  }
  // Appointment → appointments (needs a patient; mirrors bookAppointment's
  // direct RLS insert, with clinic_id derived from the caller's profile).
  if (ext.appointment && existing.patient_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("home_clinic_id")
      .eq("id", user.id)
      .single();
    if (profile?.home_clinic_id) {
      const { error: aErr } = await supabase.from("appointments").insert({
        clinic_id: profile.home_clinic_id,
        patient_id: existing.patient_id,
        appointment_date: ext.appointment.date,
        appointment_time: ext.appointment.time,
        notes: ext.appointment.reason,
        status: "scheduled",
      });
      if (aErr) console.error("appointment insert failed:", aErr);
      else revalidatePath("/appointments");
    }
  }
  // Review flag stays on the note (extraction.review_requested) — staff send
  // the link manually from /reviews. The agent never messages anyone.

  // Purge the audio (best effort — the row already dropped its reference).
  if (existing.audio_path) {
    await supabase.storage.from(VOICE_BUCKET).remove([existing.audio_path]);
  }

  if (existing.patient_id) revalidatePath(`/patients/${existing.patient_id}`);
  return { note: note as ClinicNote };
}

/**
 * Edit-and-reprocess: append the staff correction and re-run the agent, keeping
 * the note in pending_review. Nothing is materialized until Confirm.
 */
export async function reprocessNote(
  id: string,
  correction: string,
): Promise<NoteResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const note = correction.trim()
    ? (
        await supabase
          .from("clinic_notes")
          .select("id, patient_id, raw_transcript, status")
          .eq("id", id)
          .maybeSingle()
      ).data
    : null;
  if (!correction.trim()) return { error: "Add a correction first." };
  if (!note) return { error: "Note not found." };
  if (note.status !== "pending_review") {
    return { error: "This note can't be reprocessed." };
  }
  if (!note.raw_transcript) return { error: "No transcript to reprocess." };

  let extraction: NoteExtraction;
  try {
    extraction = await extractNote(supabase, {
      noteId: id,
      patientId: note.patient_id,
      transcript: note.raw_transcript,
      correction: correction.trim(),
    });
  } catch (err) {
    console.error("reprocess failed:", err);
    return { error: "Could not reprocess the note. Please try again." };
  }

  const { data: updated, error } = await supabase
    .from("clinic_notes")
    .update({
      note_text: extraction.cleaned_note,
      tags: extraction.tags,
      extraction,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(NOTE_CLIENT_COLS)
    .single();
  if (error || !updated) return { error: "Could not save the reprocessed note." };

  if (note.patient_id) revalidatePath(`/patients/${note.patient_id}`);
  return { note: updated as ClinicNote };
}

/** Delete a note (and its audio + any follow-up tasks via cascade). */
export async function deleteNote(id: string): Promise<{ ok?: true; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: existing } = await supabase
    .from("clinic_notes")
    .select("id, patient_id, audio_path")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { error: "Note not found." };

  const { error } = await supabase.from("clinic_notes").delete().eq("id", id);
  if (error) return { error: "Could not delete the note." };

  if (existing.audio_path) {
    await supabase.storage.from(VOICE_BUCKET).remove([existing.audio_path]);
  }
  if (existing.patient_id) revalidatePath(`/patients/${existing.patient_id}`);
  return { ok: true };
}

/** Raise a lightweight follow-up task off a note (manual add on a saved note). */
export async function addFollowupTask(
  noteId: string,
  description: string,
  dueDate: string | null,
): Promise<{ task?: FollowupTask; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const desc = description.trim();
  if (!desc) return { error: "Add a description first." };

  const { data: note } = await supabase
    .from("clinic_notes")
    .select("id, patient_id")
    .eq("id", noteId)
    .maybeSingle();
  if (!note) return { error: "Note not found." };

  const { data: task, error } = await supabase
    .from("followup_tasks")
    .insert({
      note_id: noteId,
      patient_id: note.patient_id,
      description: desc.slice(0, 500),
      due_date: dueDate && DATE_RE.test(dueDate) ? dueDate : null,
    })
    .select("id, note_id, patient_id, description, due_date, status, created_at")
    .single();
  if (error || !task) return { error: "Could not add the task." };

  if (note.patient_id) revalidatePath(`/patients/${note.patient_id}`);
  return { task: task as FollowupTask };
}
