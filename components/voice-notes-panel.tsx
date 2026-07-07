"use client";

import { useState } from "react";
import Link from "next/link";
import { VoiceNoteButton } from "@/components/voice-note-button";
import { VoiceNoteCard } from "@/components/voice-note-card";
import { VoiceNoteIntro } from "@/components/voice-note-intro";
import type { ClinicNote } from "@/lib/types";

// Patient-profile Voice Notes section. Seeds from the server-rendered list, then
// prepends an optimistic "Processing…" card the moment a recording is uploaded;
// each card updates itself live (poll → transcript) and on delete removes itself.

export function VoiceNotesPanel({
  patientId,
  initialNotes,
}: {
  patientId: string;
  initialNotes: ClinicNote[];
}) {
  const [notes, setNotes] = useState<ClinicNote[]>(initialNotes);

  const onCreated = (note: ClinicNote) => setNotes((prev) => [note, ...prev]);
  const onChange = (note: ClinicNote) =>
    setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
  const onRemove = (id: string) =>
    setNotes((prev) => prev.filter((n) => n.id !== id));

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-text-secondary">
          Voice Notes
        </h2>
        <div className="flex items-center gap-3">
          <Link
            href={`/notes?patient=${patientId}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            View all →
          </Link>
          <VoiceNoteButton patientId={patientId} onCreated={onCreated} />
        </div>
      </div>

      <VoiceNoteIntro />

      {notes.length === 0 ? (
        <div className="rounded-card border border-border bg-white p-6 text-center text-sm text-text-secondary">
          No voice notes yet. Tap “Voice Note” to record one.
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <VoiceNoteCard
              key={n.id}
              note={n}
              onChange={onChange}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}
