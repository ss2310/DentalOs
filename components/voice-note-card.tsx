"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "@/components/toast";
import { formatDate, formatTime } from "@/lib/format";
import {
  RECALL_TYPES,
  type ClinicNote,
  type NoteExtraction,
  type RecallType,
} from "@/lib/types";
import { confirmNote, deleteNote, reprocessNote } from "@/app/(app)/voice-notes/actions";

// One voice note. While `processing`, it kicks off transcription + extraction
// once and polls until ready. In `pending_review` it shows the agent's STAGED
// proposal — cleaned note, tags, follow-ups, recall, review flag — each
// individually editable, with one Confirm (materializes everything) and an
// Edit-and-reprocess box (re-runs the agent). `confirmed` is the read-only
// record; `failed` offers Retry.

type Props = {
  note: ClinicNote;
  onChange?: (note: ClinicNote) => void;
  onRemove?: (id: string) => void;
};

const POLL_MS = 3000;

const RECALL_LABEL: Record<RecallType, string> = {
  general_checkup: "General check-up",
  cleaning: "Cleaning",
  follow_up: "Follow-up",
  ortho_adjustment: "Ortho adjustment",
};

function toDraft(n: ClinicNote): NoteExtraction {
  return (
    n.extraction ?? {
      cleaned_note: n.note_text ?? "",
      tags: n.tags ?? [],
      followups: [],
      recall: null,
      appointment: null,
      review_requested: false,
    }
  );
}

export function VoiceNoteCard({ note: initial, onChange, onRemove }: Props) {
  const [note, setNote] = useState<ClinicNote>(initial);
  const [draft, setDraft] = useState<NoteExtraction>(() => toDraft(initial));
  const [correction, setCorrection] = useState("");
  const [busy, setBusy] = useState(false);
  const triggered = useRef(false);

  const update = (n: ClinicNote) => {
    setNote(n);
    setDraft(toDraft(n));
    onChange?.(n);
  };

  // Kick transcription + extraction once when this note first appears.
  useEffect(() => {
    if (note.status !== "processing" || triggered.current) return;
    triggered.current = true;
    fetch(`/api/voice-notes/${note.id}/transcribe`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => d?.note && update(d.note as ClinicNote))
      .catch(() => {
        /* poller is the safety net */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // Poll while processing.
  useEffect(() => {
    if (note.status !== "processing") return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/voice-notes/${note.id}`);
        if (!res.ok) return;
        const { note: fresh } = await res.json();
        if (fresh && fresh.status !== "processing") update(fresh as ClinicNote);
      } catch {
        /* keep polling */
      }
    }, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.status, note.id]);

  const retry = async () => {
    setBusy(true);
    update({ ...note, status: "processing" });
    triggered.current = true;
    try {
      const res = await fetch(`/api/voice-notes/${note.id}/transcribe`, { method: "POST" });
      const { note: fresh } = await res.json();
      if (fresh) update(fresh as ClinicNote);
    } catch {
      toast("Could not retry. Please try again.");
      update({ ...note, status: "failed" });
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!draft.cleaned_note.trim()) {
      toast("Add some note text first.");
      return;
    }
    if (draft.appointment && (!draft.appointment.date || !draft.appointment.time)) {
      toast("Set the appointment date and time, or remove it.");
      return;
    }
    setBusy(true);
    const res = await confirmNote(note.id, draft);
    setBusy(false);
    if (res.error || !res.note) {
      toast(res.error ?? "Could not save.");
      return;
    }
    update(res.note);
    toast("Note saved ✓");
  };

  const reprocess = async () => {
    if (!correction.trim()) return;
    setBusy(true);
    const res = await reprocessNote(note.id, correction);
    setBusy(false);
    if (res.error || !res.note) {
      toast(res.error ?? "Could not reprocess.");
      return;
    }
    update(res.note);
    setCorrection("");
    toast("Reprocessed ✓");
  };

  const remove = async () => {
    setBusy(true);
    const res = await deleteNote(note.id);
    setBusy(false);
    if (res.error) {
      toast(res.error);
      return;
    }
    onRemove?.(note.id);
  };

  return (
    <div className="rounded-card border border-border bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <StatusBadge status={note.status} />
        <span className="text-xs text-text-secondary">{formatDate(note.created_at)}</span>
      </div>

      {note.status === "processing" ? (
        <div className="flex items-center gap-2.5 py-2 text-sm text-text-secondary">
          <Spinner />
          <span>Transcribing &amp; reading your note…</span>
        </div>
      ) : null}

      {note.status === "failed" ? (
        <div className="space-y-3">
          <p className="text-sm text-danger">Transcription didn&apos;t work this time.</p>
          <div className="flex flex-wrap gap-2">
            <PrimaryBtn onClick={retry} disabled={busy}>Retry</PrimaryBtn>
            <GhostBtn onClick={remove} disabled={busy}>Delete</GhostBtn>
          </div>
        </div>
      ) : null}

      {note.status === "pending_review" ? (
        <PendingReview
          draft={draft}
          setDraft={setDraft}
          busy={busy}
          onConfirm={confirm}
          onDiscard={remove}
          correction={correction}
          setCorrection={setCorrection}
          onReprocess={reprocess}
        />
      ) : null}

      {note.status === "confirmed" ? <ConfirmedView note={note} /> : null}
    </div>
  );
}

function PendingReview({
  draft,
  setDraft,
  busy,
  onConfirm,
  onDiscard,
  correction,
  setCorrection,
  onReprocess,
}: {
  draft: NoteExtraction;
  setDraft: (d: NoteExtraction) => void;
  busy: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
  correction: string;
  setCorrection: (v: string) => void;
  onReprocess: () => void;
}) {
  const [tagDraft, setTagDraft] = useState("");

  const set = (patch: Partial<NoteExtraction>) => setDraft({ ...draft, ...patch });

  const addTag = () => {
    const t = tagDraft.trim();
    if (t && !draft.tags.includes(t)) set({ tags: [...draft.tags, t] });
    setTagDraft("");
  };

  return (
    <div className="space-y-4">
      {/* Cleaned note */}
      <Field label="Note">
        <textarea
          value={draft.cleaned_note}
          onChange={(e) => set({ cleaned_note: e.target.value })}
          rows={4}
          className="w-full rounded-button border border-border px-3 py-2 text-[15px] text-text-primary focus:border-primary"
          placeholder="Note…"
        />
      </Field>

      {/* Tags */}
      <Field label="Tags">
        {draft.tags.length ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {draft.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-pill bg-subtle px-2.5 py-0.5 text-xs font-medium text-text-secondary"
              >
                {t}
                <button
                  type="button"
                  onClick={() => set({ tags: draft.tags.filter((x) => x !== t) })}
                  aria-label={`Remove ${t}`}
                  className="text-text-secondary/70 hover:text-danger"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <input
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="Add a tag, press Enter"
          className="w-full rounded-button border border-border px-3 py-2 text-sm focus:border-primary"
        />
      </Field>

      {/* Follow-ups */}
      <Field label="Follow-ups">
        <div className="space-y-2">
          {draft.followups.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                value={f.description}
                onChange={(e) => {
                  const next = [...draft.followups];
                  next[i] = { ...f, description: e.target.value };
                  set({ followups: next });
                }}
                placeholder="What needs doing?"
                className="min-w-[8rem] flex-1 rounded-button border border-border px-3 py-2 text-sm focus:border-primary"
              />
              <input
                type="date"
                value={f.due_date ?? ""}
                onChange={(e) => {
                  const next = [...draft.followups];
                  next[i] = { ...f, due_date: e.target.value || null };
                  set({ followups: next });
                }}
                className="h-11 rounded-button border border-border px-3 text-sm focus:border-primary"
              />
              <button
                type="button"
                onClick={() => set({ followups: draft.followups.filter((_, j) => j !== i) })}
                aria-label="Remove follow-up"
                className="flex h-11 w-9 items-center justify-center rounded-button text-text-secondary hover:bg-subtle hover:text-danger"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              set({ followups: [...draft.followups, { description: "", due_date: null }] })
            }
            className="text-sm font-medium text-primary hover:underline"
          >
            + Add follow-up
          </button>
        </div>
      </Field>

      {/* Recall */}
      <Field label="Recall">
        {draft.recall ? (
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={draft.recall.recall_type}
              onChange={(e) =>
                set({ recall: { ...draft.recall!, recall_type: e.target.value as RecallType } })
              }
              className="h-11 rounded-button border border-border px-3 text-sm focus:border-primary"
            >
              {RECALL_TYPES.map((rt) => (
                <option key={rt} value={rt}>
                  {RECALL_LABEL[rt]}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={draft.recall.due_date}
              onChange={(e) => set({ recall: { ...draft.recall!, due_date: e.target.value } })}
              className="h-11 rounded-button border border-border px-3 text-sm focus:border-primary"
            />
            <button
              type="button"
              onClick={() => set({ recall: null })}
              className="text-sm font-medium text-text-secondary hover:text-danger"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() =>
              set({ recall: { recall_type: "general_checkup", due_date: "" } })
            }
            className="text-sm font-medium text-primary hover:underline"
          >
            + Add recall
          </button>
        )}
      </Field>

      {/* Appointment */}
      <Field label="Appointment">
        {draft.appointment ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={draft.appointment.date}
                onChange={(e) =>
                  set({ appointment: { ...draft.appointment!, date: e.target.value } })
                }
                className="h-11 rounded-button border border-border px-3 text-sm focus:border-primary"
              />
              <input
                type="time"
                value={draft.appointment.time}
                onChange={(e) =>
                  set({ appointment: { ...draft.appointment!, time: e.target.value } })
                }
                className="h-11 rounded-button border border-border px-3 text-sm focus:border-primary"
              />
              <button
                type="button"
                onClick={() => set({ appointment: null })}
                className="text-sm font-medium text-text-secondary hover:text-danger"
              >
                Remove
              </button>
            </div>
            <input
              value={draft.appointment.reason ?? ""}
              onChange={(e) =>
                set({
                  appointment: { ...draft.appointment!, reason: e.target.value || null },
                })
              }
              placeholder="Reason / treatment (optional)"
              className="w-full rounded-button border border-border px-3 py-2 text-sm focus:border-primary"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => set({ appointment: { date: "", time: "", reason: null } })}
            className="text-sm font-medium text-primary hover:underline"
          >
            + Book appointment
          </button>
        )}
      </Field>

      {/* Review flag */}
      <label className="flex items-center gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={draft.review_requested}
          onChange={(e) => set({ review_requested: e.target.checked })}
          className="h-4 w-4 accent-primary"
        />
        Ask this patient for a Google review
        <Link href="/reviews" className="text-primary hover:underline">
          (send from Reviews)
        </Link>
      </label>

      <div className="flex flex-wrap gap-2">
        <PrimaryBtn onClick={onConfirm} disabled={busy}>Confirm &amp; save</PrimaryBtn>
        <GhostBtn onClick={onDiscard} disabled={busy}>Discard</GhostBtn>
      </div>

      {/* Edit & reprocess */}
      <details className="rounded-button border border-border bg-subtle p-3">
        <summary className="cursor-pointer text-sm font-medium text-text-secondary">
          Not quite right? Correct &amp; reprocess
        </summary>
        <div className="mt-2 space-y-2">
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            rows={2}
            placeholder="e.g. the follow-up is in 3 days, not 7; there's no review needed"
            className="w-full rounded-button border border-border px-3 py-2 text-sm focus:border-primary"
          />
          <PrimaryBtn onClick={onReprocess} disabled={busy || !correction.trim()}>
            Reprocess
          </PrimaryBtn>
        </div>
      </details>
    </div>
  );
}

function ConfirmedView({ note }: { note: ClinicNote }) {
  const e = note.extraction;
  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap text-[15px] text-text-primary">{note.note_text}</p>

      {note.tags?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {note.tags.map((t) => (
            <span
              key={t}
              className="rounded-pill bg-subtle px-2.5 py-0.5 text-xs font-medium text-text-secondary"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}

      {e?.followups?.length ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
            Follow-ups
          </p>
          <ul className="mt-1 space-y-1">
            {e.followups.map((f, i) => (
              <li key={i} className="text-sm text-text-primary">
                • {f.description}
                {f.due_date ? (
                  <span className="text-text-secondary"> — {formatDate(f.due_date)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {e?.recall ? (
        <p className="text-sm text-text-primary">
          <span className="font-medium">Recall:</span> {RECALL_LABEL[e.recall.recall_type]} —{" "}
          {formatDate(e.recall.due_date)}
        </p>
      ) : null}

      {e?.appointment ? (
        <p className="text-sm text-text-primary">
          <span className="font-medium">Appointment:</span> {formatDate(e.appointment.date)} at{" "}
          {formatTime(e.appointment.time)}
          {e.appointment.reason ? ` — ${e.appointment.reason}` : ""}{" "}
          <Link href="/appointments" className="text-primary hover:underline">
            (see Appointments)
          </Link>
        </p>
      ) : null}

      {e?.review_requested ? (
        <p className="text-sm text-text-primary">
          <span className="rounded-pill bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
            Review requested
          </span>{" "}
          <Link href="/reviews" className="text-primary hover:underline">
            send from Reviews
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      {children}
    </div>
  );
}

function PrimaryBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 items-center rounded-button bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function GhostBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 items-center rounded-button border border-border px-4 text-sm font-medium text-text-secondary hover:bg-subtle disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: ClinicNote["status"] }) {
  const map: Record<ClinicNote["status"], { label: string; cls: string }> = {
    processing: { label: "Processing", cls: "bg-subtle text-text-secondary" },
    pending_review: { label: "Review", cls: "bg-warning/10 text-warning" },
    confirmed: { label: "Saved", cls: "bg-success/10 text-success" },
    failed: { label: "Failed", cls: "bg-danger/10 text-danger" },
  };
  const s = map[status];
  return (
    <span className={`rounded-pill px-2.5 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>
  );
}

function Spinner() {
  return (
    <span
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-border border-t-primary"
      aria-hidden="true"
    />
  );
}
