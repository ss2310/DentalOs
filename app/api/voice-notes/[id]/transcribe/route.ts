import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { voiceNotesEnabledForClinic } from "@/lib/voice-notes-access";
import { transcribeAudio } from "@/lib/transcribe";
import { VOICE_BUCKET, NOTE_CLIENT_COLS, mimeForExt } from "@/lib/voice-notes";
import { extractNote } from "@/lib/agent/notes-agent";
import type { NoteExtraction } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice-notes/[id]/transcribe — download the clip, run Groq whisper,
 * and move the note to `pending_review` (or `failed`). Idempotent-ish: only acts
 * on `processing`/`failed` notes; already-reviewed/confirmed notes are returned
 * untouched. Loading the row goes through RLS, so it doubles as the ownership
 * check. Returns { note } with the new status either way.
 */
export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: clinic } = await supabase
    .from("clinics")
    .select("feature_flags")
    .single();
  if (!clinic || !voiceNotesEnabledForClinic(clinic.feature_flags as Record<string, unknown>)) {
    return NextResponse.json({ error: "Voice notes are not enabled." }, { status: 403 });
  }

  // RLS-scoped read = ownership check.
  const { data: note } = await supabase
    .from("clinic_notes")
    .select("id, status, audio_path, note_text, patient_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!note) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }

  // Nothing to do for notes past transcription.
  if (note.status !== "processing" && note.status !== "failed") {
    const { data: current } = await supabase
      .from("clinic_notes")
      .select(NOTE_CLIENT_COLS)
      .eq("id", params.id)
      .single();
    return NextResponse.json({ note: current });
  }
  if (!note.audio_path) {
    await supabase
      .from("clinic_notes")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", params.id);
    return NextResponse.json(
      { error: "The recording is no longer available." },
      { status: 410 },
    );
  }

  // Ensure the card shows "processing" during a retry.
  await supabase
    .from("clinic_notes")
    .update({ status: "processing" })
    .eq("id", params.id);

  const { data: blob, error: dlError } = await supabase.storage
    .from(VOICE_BUCKET)
    .download(note.audio_path);
  if (dlError || !blob) {
    console.error("voice-note download failed:", dlError);
    await markFailed(supabase, params.id);
    return NextResponse.json({ error: "Could not read the recording." }, { status: 500 });
  }

  const ext = note.audio_path.split(".").pop() ?? "webm";
  const filename = note.audio_path.split("/").pop() ?? `note.${ext}`;

  // Transcribe first. A Groq failure is a real 'failed' state the user can retry.
  let transcript: string;
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    transcript = await transcribeAudio(bytes, filename, mimeForExt(ext));
  } catch (err) {
    console.error("transcription failed:", err);
    const { data: failed } = await markFailed(supabase, params.id);
    return NextResponse.json({ note: failed }, { status: 200 });
  }

  // Run the extraction agent. This is best-effort: if it errors, we still land
  // the transcript so staff can review/edit manually — never a hard failure.
  let extraction: NoteExtraction;
  try {
    extraction = await extractNote(supabase, {
      noteId: params.id,
      patientId: note.patient_id,
      transcript,
    });
  } catch (err) {
    console.error("notes agent failed:", err);
    extraction = {
      cleaned_note: transcript,
      tags: [],
      followups: [],
      recall: null,
      appointment: null,
      review_requested: false,
    };
  }

  const { data: updated, error: upError } = await supabase
    .from("clinic_notes")
    .update({
      raw_transcript: transcript,
      note_text: extraction.cleaned_note,
      tags: extraction.tags,
      extraction,
      status: "pending_review",
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select(NOTE_CLIENT_COLS)
    .single();
  if (upError) {
    console.error("note update failed:", upError);
    const { data: failed } = await markFailed(supabase, params.id);
    return NextResponse.json({ note: failed }, { status: 200 });
  }

  return NextResponse.json({ note: updated });
}

async function markFailed(supabase: SupabaseClient, id: string) {
  return supabase
    .from("clinic_notes")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(NOTE_CLIENT_COLS)
    .single();
}
