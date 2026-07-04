"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { DemoScreen } from "./demo-screen";
import { TourOverlay, type TourStep } from "./tour-overlay";
import { ToothIcon } from "@/components/icons";

// The scripted story. Order + reveal thresholds are mirrored by DemoScreen
// (DRAFT_AT / SENT_AT). Every target here exists as a data-tour attribute there.
const STEPS: TourStep[] = [
  {
    target: "hero",
    title: "Your morning, sorted",
    body: "Open GrowthOS and the dashboard already knows what matters — including the revenue it has quietly won back for you this month.",
  },
  {
    target: "enquiry",
    title: "Every enquiry, captured",
    body: "A new braces enquiry just came in from Instagram. GrowthOS logged it the moment it arrived — nothing slips through.",
  },
  {
    target: "draft",
    title: "AI writes the follow-up",
    body: "One tap and AI drafts a warm, on-brand reply in Hinglish — the way your patients actually chat. You stay in control; nothing sends on its own.",
  },
  {
    target: "send",
    title: "Send it on WhatsApp",
    body: "Sending opens WhatsApp with the message ready to go. No new app for your patients to install — just the chat they already use.",
  },
  {
    target: "send",
    title: "Marked sent — no double texts",
    body: "Once it's sent, GrowthOS remembers. The button turns into “✓ Sent” so the same patient never gets messaged twice.",
  },
  {
    target: "voice",
    title: "Dictate, and AI stages the rest",
    body: "After the visit, just voice-note what happened. AI drafts the follow-ups and recalls for you to approve — it never messages a patient by itself.",
  },
];

export function ProductTour() {
  const scopeRef = useRef<HTMLDivElement>(null);
  // 0..STEPS.length-1 while touring; STEPS.length means "finished".
  const [index, setIndex] = useState(0);
  const done = index >= STEPS.length;

  const next = () => setIndex((i) => Math.min(i + 1, STEPS.length));
  const back = () => setIndex((i) => Math.max(i - 1, 0));
  const finish = () => setIndex(STEPS.length);
  const replay = () => setIndex(0);

  // While touring the demo is frozen at whatever the current step reveals; when
  // finished, show the fully-revealed screen behind the completion card.
  const revealIndex = done ? STEPS.length : index;

  return (
    <div ref={scopeRef} className="relative min-h-screen">
      <DemoScreen index={revealIndex} />

      {!done ? (
        <TourOverlay
          steps={STEPS}
          index={index}
          scopeRef={scopeRef}
          onNext={next}
          onBack={back}
          onClose={finish}
        />
      ) : (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,23,0.55)] px-4">
          <div className="w-full max-w-sm rounded-card border border-border bg-white p-6 text-center shadow-card">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-card bg-primary/10 text-primary">
              <ToothIcon width={26} height={26} />
            </span>
            <h2 className="mt-4 text-[22px] font-semibold tracking-[-0.02em] text-text-primary">
              That&apos;s the GrowthOS loop
            </h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-text-secondary">
              Capture every enquiry, follow up in seconds, and never message a
              patient twice — all from one screen.
            </p>
            <Link
              href="/signup"
              className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-button bg-primary px-4 text-[15px] font-semibold text-white hover:bg-primary/90"
            >
              Start your 30-day free trial
            </Link>
            <div className="mt-2 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={replay}
                className="min-h-[44px] text-sm font-medium text-text-secondary hover:text-text-primary"
              >
                Replay tour
              </button>
              <Link
                href="/"
                className="min-h-[44px] text-sm font-medium text-primary hover:underline"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
