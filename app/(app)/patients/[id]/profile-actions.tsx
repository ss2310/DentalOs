"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import type { PatientOption } from "@/lib/types";
import { BookAppointment } from "@/app/(app)/appointments/book-appointment";
import { AddCaseModal } from "@/app/(app)/pipeline/add-case";
import { addQuickNote } from "./note-actions";

// The profile header's "manage everything from here" row: book a future
// appointment, start a treatment case (pipeline), or jot a quick note —
// reusing the app-wide modals with the patient locked in.

type RateCard = { id: string; treatment_name: string; base_price: string };

const btnBase =
  "flex h-11 items-center justify-center rounded-button px-3.5 text-sm font-medium disabled:opacity-50";
const btnOutline = `${btnBase} border border-border text-text-primary hover:bg-subtle`;

export function ProfileActions({
  patient,
  rateCards,
  defaultDoctor,
  today,
}: {
  patient: PatientOption;
  rateCards: RateCard[];
  defaultDoctor: string;
  today: string; // IST YYYY-MM-DD
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [bookOpen, setBookOpen] = useState(false);
  const [caseOpen, setCaseOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  function saveNote() {
    if (!noteText.trim()) return;
    setNoteError(null);
    startTransition(async () => {
      const res = await addQuickNote({ patientId: patient.id, text: noteText });
      if (res.error) {
        setNoteError(res.error);
        return;
      }
      toast("Note saved ✓");
      setNoteOpen(false);
      setNoteText("");
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" className={btnOutline} onClick={() => setBookOpen(true)}>
        Book Appointment
      </button>
      <button type="button" className={btnOutline} onClick={() => setCaseOpen(true)}>
        Add Case
      </button>
      <button
        type="button"
        className={btnOutline}
        onClick={() => {
          setNoteText("");
          setNoteError(null);
          setNoteOpen(true);
        }}
      >
        Quick Note
      </button>

      {/* Patient locked in both modals — combobox never shows, so no patient
          list needs loading here. */}
      <BookAppointment
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        patients={[]}
        rateCards={rateCards}
        defaultDate={today}
        defaultDoctor={defaultDoctor}
        initialPatient={patient}
      />
      <AddCaseModal
        open={caseOpen}
        onClose={() => setCaseOpen(false)}
        patients={[]}
        rateCards={rateCards}
        initialPatient={patient}
      />

      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="Quick Note">
        <div className="space-y-4">
          {noteError ? (
            <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {noteError}
            </p>
          ) : null}
          <div>
            <label htmlFor="quick-note" className="mb-1.5 block text-sm font-medium text-text-primary">
              Note for {patient.full_name}
            </label>
            <textarea
              id="quick-note"
              rows={4}
              maxLength={2000}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="e.g. Prefers evening appointments; sensitive to cold."
              className="w-full rounded-button border border-border px-3 py-2.5 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              autoFocus
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setNoteOpen(false)}
              className={`${btnBase} flex-1 border border-border text-text-primary hover:bg-subtle`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveNote}
              disabled={pending || !noteText.trim()}
              className={`${btnBase} flex-1 bg-primary text-white hover:bg-primary/90`}
            >
              {pending ? "Saving…" : "Save Note"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
