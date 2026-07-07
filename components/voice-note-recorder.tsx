"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/modal";
import { VoiceNoteCard } from "@/components/voice-note-card";
import { extForMime, MAX_RECORDING_MS } from "@/lib/voice-notes";
import type { ClinicNote } from "@/lib/types";

// Records a clip with MediaRecorder (max 3 min), uploads it, then either hands
// the created note to `onCreated` (patient panel adds it to its list) or shows
// it inline for review (`reviewInline`, used by the header's general-note flow).

type Phase = "idle" | "recording" | "uploading" | "review" | "error";
type ErrKind = "denied" | "unsupported" | "upload";

type Props = {
  open: boolean;
  onClose: () => void;
  patientId: string | null;
  onCreated?: (note: ClinicNote) => void;
  reviewInline?: boolean;
};

const PREFERRED_MIME = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
];

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of PREFERRED_MIME) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return "";
}

function mmss(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VoiceNoteRecorder({
  open,
  onClose,
  patientId,
  onCreated,
  reviewInline,
}: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errKind, setErrKind] = useState<ErrKind | null>(null);
  const [errMsg, setErrMsg] = useState<string>("");
  const [seconds, setSeconds] = useState(0);
  const [created, setCreated] = useState<ClinicNote | null>(null);

  const mrRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  const clearTimers = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (capRef.current) clearTimeout(capRef.current);
    tickRef.current = null;
    capRef.current = null;
  };

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const fail = (kind: ErrKind, msg = "") => {
    clearTimers();
    stopTracks();
    setErrKind(kind);
    setErrMsg(msg);
    setPhase("error");
  };

  const stopRecording = () => {
    clearTimers();
    const mr = mrRef.current;
    if (mr && mr.state !== "inactive") mr.stop(); // → onstop → handleStop
  };

  const upload = async (blob: Blob, mime: string) => {
    setPhase("uploading");
    const ext = extForMime(mime) ?? "webm";
    const form = new FormData();
    form.append("audio", blob, `note.${ext}`);
    if (patientId) form.append("patientId", patientId);
    try {
      const res = await fetch("/api/voice-notes", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.note) {
        fail("upload", data?.error ?? "Could not save the recording.");
        return;
      }
      const note = data.note as ClinicNote;
      if (onCreated) {
        onCreated(note);
        close();
      } else if (reviewInline) {
        setCreated(note);
        setPhase("review");
      } else {
        close();
      }
    } catch {
      fail("upload", "Could not save the recording. Check your connection.");
    }
  };

  const handleStop = () => {
    stopTracks();
    if (cancelledRef.current) return;
    const mime = mrRef.current?.mimeType || chunksRef.current[0]?.type || "audio/webm";
    const blob = new Blob(chunksRef.current, { type: mime });
    if (blob.size === 0) {
      fail("upload", "Nothing was recorded. Please try again.");
      return;
    }
    void upload(blob, mime);
  };

  const start = async () => {
    cancelledRef.current = false;
    setErrKind(null);
    setErrMsg("");
    setSeconds(0);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      fail("unsupported");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      fail("denied");
      return;
    }
    streamRef.current = stream;
    const mime = pickMime();
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = handleStop;
    mrRef.current = mr;
    mr.start();
    setPhase("recording");
    tickRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    capRef.current = setTimeout(stopRecording, MAX_RECORDING_MS);
  };

  const cancel = () => {
    cancelledRef.current = true;
    stopRecording();
    stopTracks();
    close();
  };

  const close = () => {
    clearTimers();
    stopTracks();
    mrRef.current = null;
    chunksRef.current = [];
    setPhase("idle");
    setErrKind(null);
    setErrMsg("");
    setSeconds(0);
    setCreated(null);
    onClose();
  };

  // Auto-start recording as soon as the modal opens.
  useEffect(() => {
    if (open && phase === "idle") void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Safety net: stop the mic if the component unmounts mid-recording.
  useEffect(() => {
    return () => {
      clearTimers();
      stopTracks();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open) return null;

  return (
    <Modal open={open} onClose={phase === "recording" ? cancel : close} title="Voice note">
      {phase === "recording" ? (
        <div className="flex flex-col items-center gap-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="h-3 w-3 animate-pulse rounded-full bg-danger" aria-hidden="true" />
            <span className="text-sm font-medium text-danger">Recording</span>
          </div>
          <p className="text-5xl font-semibold tabular-nums tracking-[-0.02em] text-text-primary">
            {mmss(seconds)}
          </p>
          <p className="text-xs text-text-secondary">Auto-stops at 3:00</p>
          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={cancel}
              className="h-12 flex-1 rounded-button border border-border text-[15px] font-medium text-text-secondary hover:bg-subtle"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={stopRecording}
              className="h-12 flex-1 rounded-button bg-primary text-[15px] font-medium text-white hover:bg-primary/90"
            >
              Stop &amp; save
            </button>
          </div>
        </div>
      ) : null}

      {phase === "idle" || phase === "uploading" ? (
        <div className="flex flex-col items-center gap-3 py-8 text-sm text-text-secondary">
          <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
          <span>{phase === "uploading" ? "Saving your note…" : "Starting mic…"}</span>
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="space-y-4 py-2">
          <p className="text-[15px] text-text-primary">
            {errKind === "denied"
              ? "Mic ka permission chahiye. Browser ke address bar me mic ko “Allow” karein, phir dobara try karein."
              : errKind === "unsupported"
                ? "Is browser me recording support nahi hai. Chrome (Android) ya Safari me try karein."
                : errMsg || "Kuch galat ho gaya. Please dobara try karein."}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={close}
              className="h-11 flex-1 rounded-button border border-border text-sm font-medium text-text-secondary hover:bg-subtle"
            >
              Close
            </button>
            {errKind !== "unsupported" ? (
              <button
                type="button"
                onClick={() => start()}
                className="h-11 flex-1 rounded-button bg-primary text-sm font-medium text-white hover:bg-primary/90"
              >
                Try again
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {phase === "review" && created ? (
        <div className="space-y-4">
          <VoiceNoteCard
            note={created}
            onChange={setCreated}
            onRemove={() => close()}
          />
          <button
            type="button"
            onClick={close}
            className="h-11 w-full rounded-button border border-border text-sm font-medium text-text-secondary hover:bg-subtle"
          >
            Done
          </button>
        </div>
      ) : null}
    </Modal>
  );
}
