"use client";

import { useState } from "react";
import { MicIcon } from "@/components/icons";
import { VoiceNoteRecorder } from "@/components/voice-note-recorder";
import type { ClinicNote } from "@/lib/types";

// The 🎙️ trigger. `prominent` = the labelled teal button on the patient
// profile; `icon` = the compact header button for a general (patient-less) note.

type Props = {
  patientId: string | null;
  variant?: "prominent" | "icon";
  onCreated?: (note: ClinicNote) => void;
  reviewInline?: boolean;
  label?: string;
};

export function VoiceNoteButton({
  patientId,
  variant = "prominent",
  onCreated,
  reviewInline,
  label = "Voice Note",
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Record a voice note"
          className="flex h-11 w-11 items-center justify-center rounded-button text-text-secondary hover:bg-subtle"
        >
          <MicIcon />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-11 items-center gap-2 rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
        >
          <MicIcon width={18} height={18} />
          {label}
        </button>
      )}
      <VoiceNoteRecorder
        open={open}
        onClose={() => setOpen(false)}
        patientId={patientId}
        onCreated={onCreated}
        reviewInline={reviewInline}
      />
    </>
  );
}
