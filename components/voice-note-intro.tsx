"use client";

import { useEffect, useState } from "react";

// First-run explainer shown once (per browser) above the Voice Notes section on
// a patient profile. Mirrors the localStorage pattern in components/how-it-works
// so it never nags after dismissal. Bump the version suffix to re-show it.
const SEEN_KEY = "growthos:voice-notes-intro:v1";

export function VoiceNoteIntro() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) !== "1") setShow(true);
    } catch {
      // localStorage blocked (private mode) — just skip the hint.
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
  };

  return (
    <div className="mb-3 flex items-start gap-3 rounded-card border border-primary/30 bg-primary/5 p-4">
      <span className="text-lg leading-none" aria-hidden="true">
        🎙️
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-text-primary">
          Bol ke note banao — follow-up, recall, review sab automatic
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          Hinglish mein bolo. Staff har note review karta hai before kuch save
          ho — patient ko kabhi apne-aap message nahi jaata.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-button px-2 py-1 text-text-secondary hover:bg-black/[0.04]"
      >
        ✕
      </button>
    </div>
  );
}
