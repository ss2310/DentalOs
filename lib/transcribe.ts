import "server-only";

// Speech-to-text via Groq's OpenAI-compatible audio endpoint (whisper-large-v3).
// Groq accepts webm/mp4/ogg/mpeg/wav directly, so we pass the browser's own
// recording through untouched — no server-side transcode. The GROQ_API_KEY is
// read on the server only and NEVER reaches the client (callers are Node-runtime
// route handlers / server actions).

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const MODEL = "whisper-large-v3";
const TIMEOUT_MS = 60_000;

export class TranscriptionError extends Error {}

/**
 * Transcribe an audio clip. `bytes` is the raw recording, `filename` carries a
 * correct extension (Groq infers the container from it), `mime` is the content
 * type. Returns the trimmed transcript text. Throws TranscriptionError on any
 * failure so the caller can mark the note `failed` and offer a retry.
 */
export async function transcribeAudio(
  bytes: ArrayBuffer | Uint8Array,
  filename: string,
  mime: string,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new TranscriptionError("Transcription is not configured on the server.");
  }

  const form = new FormData();
  // Cast: a Uint8Array is a valid BlobPart at runtime; the DOM lib's generic
  // ArrayBufferLike vs ArrayBuffer mismatch is a type-only nuisance.
  form.append("file", new Blob([bytes as BlobPart], { type: mime }), filename);
  form.append("model", MODEL);
  form.append("response_format", "json");
  // Auto-detect language: clinics speak Hindi/English/Hinglish, so we don't pin
  // a `language` — whisper-large-v3 handles code-switching well.

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    throw new TranscriptionError(
      err instanceof Error && err.name === "AbortError"
        ? "Transcription timed out."
        : "Could not reach the transcription service.",
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    // Log the provider detail server-side; surface a generic message.
    const detail = await res.text().catch(() => "");
    console.error(`Groq transcription failed (${res.status}):`, detail.slice(0, 500));
    throw new TranscriptionError("The transcription service returned an error.");
  }

  const data = (await res.json().catch(() => null)) as { text?: string } | null;
  const text = (data?.text ?? "").trim();
  if (!text) {
    throw new TranscriptionError("No speech was detected in the recording.");
  }
  return text;
}
