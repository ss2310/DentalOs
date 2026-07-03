"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { HelpIcon } from "@/components/icons";

// Bump the version suffix if the intro content changes enough that returning
// users should see it again.
const SEEN_KEY = "growthos:intro-seen:v1";

type Stage = {
  n: string;
  title: string;
  blurb: string;
  tools: string[];
};

// Mirrors the three journey groups in the sidebar (see components/app-shell.tsx).
// Keep tool names in sync with the NAV labels.
const STAGES: Stage[] = [
  {
    n: "1",
    title: "Get patients in",
    blurb:
      "Capture every enquiry and chase treatment plans until the patient says yes.",
    tools: ["Enquiries", "Treatment Plans"],
  },
  {
    n: "2",
    title: "Run the clinic",
    blurb: "Book appointments, see patients, and log each visit as it happens.",
    tools: ["Appointments", "Patients"],
  },
  {
    n: "3",
    title: "Get paid & keep them",
    blurb:
      "Collect what's due, bring patients back for check-ups, and ask happy ones to leave a review.",
    tools: ["Payments", "Check-up Reminders", "Reviews"],
  },
];

/**
 * "How GrowthOS works" intro. Auto-opens on a user's first visit (tracked in
 * localStorage so it never nags), and can be reopened anytime from the header
 * button. Doubles as the walkthrough to screen-share when demoing the product.
 */
export function HowItWorks() {
  const [open, setOpen] = useState(false);

  // First-run: auto-open once per browser until dismissed.
  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) !== "1") setOpen(true);
    } catch {
      // localStorage blocked (private mode) — just skip the auto-open.
    }
  }, []);

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // ignore
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How GrowthOS works"
        className="flex h-11 items-center gap-2 rounded-button px-3 text-sm font-medium text-text-secondary hover:bg-subtle"
      >
        <HelpIcon />
        <span className="hidden sm:inline">How it works</span>
      </button>

      <Modal open={open} onClose={close} title="How GrowthOS works">
        <div className="space-y-4">
          <p className="text-[15px] text-text-secondary">
            GrowthOS turns every enquiry into a returning, paying patient.
            Here&apos;s the whole journey — each step is a tool in the sidebar.
          </p>

          <ol className="space-y-3">
            {STAGES.map((s) => (
              <li
                key={s.n}
                className="rounded-card border border-border bg-subtle p-4"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-primary text-xs font-semibold text-white">
                    {s.n}
                  </span>
                  <h3 className="text-[16px] font-semibold text-text-primary">
                    {s.title}
                  </h3>
                </div>
                <p className="mt-2 text-sm text-text-secondary">{s.blurb}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.tools.map((t) => (
                    <span
                      key={t}
                      className="rounded-pill bg-white px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-inset ring-primary/20"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ol>

          {/* Cross-cutting safety net — Revenue Recovered runs under all three. */}
          <div className="rounded-card border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <span className="text-base" aria-hidden="true">
                🛟
              </span>
              <h3 className="text-[15px] font-semibold text-text-primary">
                Revenue Recovered — your safety net
              </h3>
            </div>
            <p className="mt-1.5 text-sm text-text-secondary">
              Running under all three steps, it tracks money won back
              automatically: no-shows rebooked, dues collected, &ldquo;still
              thinking&rdquo; cases revived, and lapsed patients returned.
            </p>
          </div>

          <p className="text-sm text-text-secondary">
            <span className="font-medium text-text-primary">
              Start on the Dashboard each morning
            </span>{" "}
            — it lists exactly what needs doing today.
          </p>

          <button
            type="button"
            onClick={close}
            className="min-h-[44px] w-full rounded-button bg-primary py-2.5 text-[15px] font-semibold text-white hover:bg-primary/90"
          >
            Got it
          </button>
        </div>
      </Modal>
    </>
  );
}
