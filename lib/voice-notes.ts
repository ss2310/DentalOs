// Shared voice-note constants + pure helpers (no server-only imports, so both
// the API routes and — if ever needed — client code can read them). The
// GROQ/transcription secret lives in lib/transcribe.ts, never here.

export const VOICE_BUCKET = "voice-notes";

// 10 MB matches the bucket's file_size_limit in migration 023 — comfortably
// covers a 3-minute opus/mp4 clip.
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export const MAX_RECORDING_MS = 3 * 60 * 1000; // 3 minutes

// Container mime → file extension. Kept in lockstep with the bucket's
// allowed_mime_types. Browsers vary: Chrome/Firefox emit webm/opus, Safari
// emits mp4/aac — Groq accepts them all, so we never transcode.
export const ALLOWED_AUDIO_MIME: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
};

/** Strip any `;codecs=…` parameter and normalise. */
export function baseMime(type: string): string {
  return (type || "").split(";")[0].trim().toLowerCase();
}

/** The file extension for an audio mime, or null if unsupported. */
export function extForMime(type: string): string | null {
  return ALLOWED_AUDIO_MIME[baseMime(type)] ?? null;
}

/** Reverse map: mime for a stored object's extension (for re-upload to Groq). */
export function mimeForExt(ext: string): string {
  const found = Object.entries(ALLOWED_AUDIO_MIME).find(([, e]) => e === ext);
  return found ? found[0] : "application/octet-stream";
}

// Columns safe to hand back to the browser — deliberately omits audio_path,
// clinic_id and created_by.
export const NOTE_CLIENT_COLS =
  "id, patient_id, raw_transcript, note_text, tags, status, extraction, created_at, updated_at";
