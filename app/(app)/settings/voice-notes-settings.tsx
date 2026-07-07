"use client";

import { useState, useTransition } from "react";
import {
  setVoiceNotesEnabled,
  deleteAllVoiceNotesData,
} from "./actions";

// Clinic-facing Voice Notes controls: a self-serve on/off toggle, a DPDP data
// export, and an irreversible delete-all. The platform still holds a global
// kill-switch (ENABLE_VOICE_NOTES) — when that's off we say so and disable the
// toggle, since flipping the clinic bit would have no effect.

export function VoiceNotesSettings({
  enabled,
  globalEnabled,
  dailyCap,
}: {
  enabled: boolean;
  globalEnabled: boolean;
  dailyCap: number;
}) {
  const [on, setOn] = useState(enabled);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !on;
    setOn(next); // optimistic
    setMsg(null);
    startTransition(async () => {
      const res = await setVoiceNotesEnabled(next);
      if (res.error) {
        setOn(!next); // revert
        setMsg({ ok: false, text: res.error });
      }
    });
  };

  const doDelete = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await deleteAllVoiceNotesData();
      if (res.error) {
        setMsg({ ok: false, text: res.error });
      } else {
        setMsg({
          ok: true,
          text: `Deleted ${res.deleted ?? 0} note${
            res.deleted === 1 ? "" : "s"
          } and their follow-ups.`,
        });
        setShowDelete(false);
        setConfirmText("");
      }
    });
  };

  return (
    <div className="max-w-2xl space-y-6">
      {/* Enable toggle */}
      <div className="rounded-card border border-border bg-white p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[15px] font-semibold text-text-primary">
              Voice Notes
            </h3>
            <p className="mt-1 text-sm text-text-secondary">
              Let staff dictate a note on any patient. It&apos;s transcribed and
              turned into a reviewable draft — follow-ups, recalls and review
              flags — that a human confirms before anything is saved. Patients
              are never messaged automatically.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label="Enable Voice Notes"
            disabled={pending || !globalEnabled}
            onClick={toggle}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors disabled:opacity-50 ${
              on ? "bg-primary" : "bg-border"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-pill bg-white shadow transition-transform ${
                on ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <p className="mt-3 text-xs text-text-secondary">
          Up to {dailyCap} notes per day. Recording &amp; the AI draft are free —
          no credits are charged.
        </p>

        {!globalEnabled ? (
          <p className="mt-3 rounded-button bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
            Voice Notes are turned off platform-wide right now, so this setting
            has no effect until they&apos;re re-enabled.
          </p>
        ) : null}
      </div>

      {/* Data export (DPDP) */}
      <div className="rounded-card border border-border bg-white p-5">
        <h3 className="text-[15px] font-semibold text-text-primary">
          Export your voice-note data
        </h3>
        <p className="mt-1 text-sm text-text-secondary">
          Download every note, follow-up and agent audit record for your clinic
          as a JSON file.
        </p>
        <a
          href="/api/voice-notes/export"
          className="mt-3 inline-flex h-11 items-center rounded-button border border-border px-4 text-[15px] font-medium text-text-primary hover:bg-subtle"
        >
          Download JSON
        </a>
      </div>

      {/* Danger zone: delete all */}
      <div className="rounded-card border border-danger/30 bg-white p-5">
        <h3 className="text-[15px] font-semibold text-danger">
          Delete all voice-note data
        </h3>
        <p className="mt-1 text-sm text-text-secondary">
          Permanently erase every voice note, follow-up task and stored audio for
          your clinic. This cannot be undone.
        </p>

        {!showDelete ? (
          <button
            type="button"
            onClick={() => {
              setShowDelete(true);
              setMsg(null);
            }}
            className="mt-3 inline-flex h-11 items-center rounded-button border border-danger/40 px-4 text-[15px] font-medium text-danger hover:bg-danger/5"
          >
            Delete all data…
          </button>
        ) : (
          <div className="mt-3 space-y-3">
            <label className="block text-sm text-text-secondary">
              Type <span className="font-semibold text-text-primary">DELETE</span>{" "}
              to confirm.
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="mt-1 h-11 w-full rounded-button border border-border bg-white px-3 text-[15px] text-text-primary"
                autoComplete="off"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={confirmText !== "DELETE" || pending}
                onClick={doDelete}
                className="inline-flex h-11 items-center rounded-button bg-danger px-4 text-[15px] font-semibold text-white hover:bg-danger/90 disabled:opacity-50"
              >
                {pending ? "Deleting…" : "Permanently delete"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDelete(false);
                  setConfirmText("");
                }}
                className="inline-flex h-11 items-center rounded-button border border-border px-4 text-[15px] font-medium text-text-primary hover:bg-subtle"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {msg ? (
        <p
          className={`text-sm font-medium ${
            msg.ok ? "text-success" : "text-danger"
          }`}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
