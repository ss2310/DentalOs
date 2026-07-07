import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nowIST } from "@/lib/format";
import {
  voiceNotesEnabledForClinic,
  voiceNotesDailyCap,
} from "@/lib/voice-notes-access";
import {
  VOICE_BUCKET,
  MAX_AUDIO_BYTES,
  extForMime,
  baseMime,
  NOTE_CLIENT_COLS,
} from "@/lib/voice-notes";

// Uploads run on the Node runtime (Blob/arrayBuffer + Supabase storage).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/voice-notes — multipart upload of a recorded clip.
 * Fields: `audio` (Blob), optional `patientId`. Uploads to
 * voice-notes/<clinic_id>/<uuid>.<ext> (storage RLS keeps it clinic-scoped),
 * then inserts a clinic_notes row in `processing`. Returns { note }.
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Feature flag (defense in depth — the UI is already gated). RLS returns only
  // the caller's clinic, so clinic.id is the tenant to scope the object path to.
  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, feature_flags")
    .single();
  if (!clinic || !voiceNotesEnabledForClinic(clinic.feature_flags as Record<string, unknown>)) {
    return NextResponse.json({ error: "Voice notes are not enabled." }, { status: 403 });
  }

  // Daily processing cap — bounds transcription + agent spend per clinic. Count
  // notes CREATED since the start of today (IST); the count is RLS-scoped so it
  // only ever sees this clinic's rows. Rejecting here (before upload) means a
  // capped clinic never even stores audio or triggers the agent.
  const cap = voiceNotesDailyCap();
  const dayStartIST = `${nowIST().date}T00:00:00+05:30`;
  const { count: todayCount } = await supabase
    .from("clinic_notes")
    .select("id", { count: "exact", head: true })
    .gte("created_at", dayStartIST);
  if ((todayCount ?? 0) >= cap) {
    return NextResponse.json(
      {
        error: `Daily voice-note limit reached (${cap} today). Please try again tomorrow.`,
      },
      { status: 429 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "No audio was received." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Recording is too large." }, { status: 413 });
  }

  const mime = baseMime(audio.type);
  const ext = extForMime(mime);
  if (!ext) {
    return NextResponse.json(
      { error: "That audio format isn't supported." },
      { status: 415 },
    );
  }

  // Optional patient link — verify it belongs to THIS clinic (RLS read) so a
  // crafted request can't attach a note to another tenant's patient.
  const rawPatientId = form.get("patientId");
  let patientId: string | null = null;
  if (typeof rawPatientId === "string" && rawPatientId.trim()) {
    const { data: patient } = await supabase
      .from("patients")
      .select("id")
      .eq("id", rawPatientId.trim())
      .maybeSingle();
    if (!patient) {
      return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    }
    patientId = patient.id;
  }

  const objectName = crypto.randomUUID();
  const path = `${clinic.id}/${objectName}.${ext}`;
  const bytes = new Uint8Array(await audio.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(VOICE_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (uploadError) {
    console.error("voice-note upload failed:", uploadError);
    return NextResponse.json({ error: "Could not save the recording." }, { status: 500 });
  }

  // clinic_id + created_by come from the column defaults (session-derived), so a
  // client can never spoof them; RLS insert check requires clinic_id match.
  const { data: note, error: insertError } = await supabase
    .from("clinic_notes")
    .insert({ patient_id: patientId, status: "processing", audio_path: path })
    .select(NOTE_CLIENT_COLS)
    .single();

  if (insertError || !note) {
    console.error("clinic_notes insert failed:", insertError);
    // Roll back the orphaned upload so we don't leak storage.
    await supabase.storage.from(VOICE_BUCKET).remove([path]);
    return NextResponse.json({ error: "Could not create the note." }, { status: 500 });
  }

  return NextResponse.json({ note });
}
