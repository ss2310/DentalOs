"use client";

import {
  ToothIcon,
  BellIcon,
  LeadsIcon,
  WhatsAppIcon,
  MicIcon,
} from "@/components/icons";

// A faux GrowthOS screen for the product tour. Pure presentation, mock data —
// it never touches Supabase, auth, or a real clinic_id, so there's zero
// multi-tenancy surface here. Uses the real design tokens so it reads as the
// genuine app. Progressive reveals are driven by the tour's step `index`
// (passed down) rather than real clicks, giving the "click reveals a feature"
// feel while the tour stays fully user-driven.

// Reveal thresholds — keep in step with the STEPS array in product-tour.tsx.
const DRAFT_AT = 2; // the AI-drafted WhatsApp message appears
const SENT_AT = 4; // the send button flips to "✓ Sent"

const DEMO_MESSAGE =
  "Hi Priya! 😊 Aapke braces treatment ke baare mein baat karne ke liye " +
  "thank you. Sunrise Dental mein hum aapko best care denge. Kya hum kal " +
  "4 baje ek quick consultation book karein? — Dr. Mehta";

export function DemoScreen({ index }: { index: number }) {
  const draftShown = index >= DRAFT_AT;
  const sent = index >= SENT_AT;

  return (
    <div className="min-h-full bg-subtle">
      <div className="flex">
        {/* Faux sidebar — decorative, desktop only (not a tour target). */}
        <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-white px-3 py-5 lg:flex">
          <div className="flex items-center gap-2.5 px-3 pb-6">
            <span className="flex h-9 w-9 items-center justify-center rounded-button bg-primary/10 text-primary">
              <ToothIcon width={20} height={20} />
            </span>
            <span className="text-lg font-semibold tracking-tight text-text-primary">
              GrowthOS
            </span>
          </div>
          {[
            "Dashboard",
            "Enquiries",
            "Treatment Plans",
            "Appointments",
            "Patients",
            "Payments",
          ].map((label, i) => (
            <div
              key={label}
              className={`flex min-h-[40px] items-center gap-3 rounded-button px-3 text-[15px] ${
                i === 0
                  ? "bg-black/[0.05] font-medium text-text-primary"
                  : "text-text-secondary"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  i === 0 ? "bg-primary" : "bg-border"
                }`}
              />
              {label}
            </div>
          ))}
        </aside>

        {/* Main column */}
        <div className="min-w-0 flex-1">
          {/* Faux header */}
          <header className="flex h-14 items-center justify-between border-b border-border bg-white/80 px-4 backdrop-blur-md sm:px-6">
            <span className="text-[15px] font-semibold text-text-primary">
              Sunrise Dental
            </span>
            <span className="relative flex h-9 w-9 items-center justify-center rounded-button text-text-secondary">
              <BellIcon />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />
            </span>
          </header>

          <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
            <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
              Good morning, Dr. Mehta
            </h1>
            <p className="mt-1 text-[15px] text-text-secondary">
              Here&apos;s exactly what needs doing today.
            </p>

            {/* Stat grid — the hero metric is the first tour target. */}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div
                data-tour="hero"
                className="rounded-card bg-primary p-5 shadow-card"
              >
                <p className="text-sm font-medium text-white/75">
                  Revenue recovered
                </p>
                <p className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.02em] text-white">
                  ₹1,24,000
                </p>
                <p className="mt-2 text-sm text-white/65">this month</p>
              </div>
              <div className="rounded-card border border-border bg-white p-5 shadow-card">
                <p className="text-sm font-medium text-text-secondary">
                  New enquiries
                </p>
                <p className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.02em] text-text-primary">
                  3
                </p>
                <p className="mt-2 text-sm text-text-secondary">need a reply</p>
              </div>
              <div className="rounded-card border border-border bg-white p-5 shadow-card">
                <p className="text-sm font-medium text-text-secondary">
                  Appointments
                </p>
                <p className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.02em] text-text-primary">
                  8
                </p>
                <p className="mt-2 text-sm text-text-secondary">today</p>
              </div>
            </div>

            <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
              Needs your attention
            </h2>

            {/* The enquiry → draft → send flow, all in one card. */}
            <div className="rounded-card border border-border bg-white p-5 shadow-card">
              <div
                data-tour="enquiry"
                className="flex items-center gap-3 rounded-button p-1"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-primary">
                  <LeadsIcon width={20} height={20} />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-text-primary">
                    Priya Sharma
                  </p>
                  <p className="truncate text-sm text-text-secondary">
                    Braces enquiry · via Instagram · 2m ago
                  </p>
                </div>
                <span className="ml-auto rounded-pill bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                  New
                </span>
              </div>

              {/* AI-drafted WhatsApp message — revealed at the draft step. */}
              <div
                data-tour="draft"
                className={`overflow-hidden transition-all duration-500 ${
                  draftShown ? "mt-4 max-h-72" : "max-h-0"
                }`}
              >
                <div className="rounded-card border border-border bg-subtle p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-primary">
                      <WhatsAppIcon width={18} height={18} />
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
                      AI-drafted follow-up
                    </span>
                  </div>
                  <p className="mt-2.5 text-[15px] leading-relaxed text-text-primary">
                    {DEMO_MESSAGE}
                  </p>
                </div>
              </div>

              {/* Send button — flips to the "✓ Sent" anti-duplicate state. */}
              <div data-tour="send" className="mt-4">
                {sent ? (
                  <span className="inline-flex min-h-[44px] items-center gap-2 rounded-button bg-success/10 px-4 text-[15px] font-semibold text-success">
                    ✓ Sent on WhatsApp
                  </span>
                ) : (
                  <span className="inline-flex min-h-[44px] items-center gap-2 rounded-button bg-primary px-4 text-[15px] font-semibold text-white">
                    <WhatsAppIcon width={18} height={18} />
                    Send on WhatsApp
                  </span>
                )}
              </div>
            </div>

            {/* Voice-note card — the notes agent step. */}
            <div
              data-tour="voice"
              className="mt-4 rounded-card border border-border bg-white p-5 shadow-card"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-primary/10 text-primary">
                  <MicIcon width={20} height={20} />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-text-primary">
                    Voice note · Priya Sharma
                  </p>
                  <p className="text-sm text-text-secondary">
                    AI staged 2 follow-ups for your review
                  </p>
                </div>
                <span className="ml-auto rounded-pill bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  Review
                </span>
              </div>
            </div>

            {/* Trailing room so the tour can always scroll a low target up to
                centre, clear of the bottom-sheet callout on narrow screens. */}
            <div aria-hidden className="h-[55vh]" />
          </main>
        </div>
      </div>
    </div>
  );
}
