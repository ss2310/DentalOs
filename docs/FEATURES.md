# GrowthOS — Complete Features Document

**What it is:** the operating system for an Indian dental clinic — front desk,
revenue, and marketing in one app, built for receptionists and doctors on
Android Chrome and desktop. WhatsApp-first (every message is a one-tap wa.me
send — GrowthOS never messages a patient automatically), ₹/IST/+91 throughout,
Hinglish where it matters.

**Two layers:**
1. **Practice management** — enquiries → appointments → billing → recalls →
   recovery. The daily engine.
2. **AI growth engine** — content, social, local SEO, AI-search visibility,
   and a full competitive audit. The reason clinics upgrade.

**Pricing:** Free Trial (₹1) → **Growth ₹2,499/month** — 100 content credits,
20 map-scan credits, 1 Deep Audit per period, 30 social posts/month. Top-ups:
Content 50/₹499 · Map 10/₹899 · Deep Audit ₹599. Payments via Cashfree (UPI).

---

## Start here

### Dashboard
The morning to-do list: new enquiries to answer, today's appointments, dues to
collect, check-ups due, complaints to handle. Work top to bottom; every card
links into the full screen behind it.

## Get Patients In

### Enquiries (leads)
Every phone/walk-in/Instagram enquiry logged with source and status. One-tap
Hinglish WhatsApp replies. Aging badges (30/60/90+ days) so nobody goes cold
silently. Converts to a patient + appointment when they book.

### Treatment Plans (pipeline)
Quoted treatments with value, stage (Quoted → Thinking → Scheduled → Done /
Lost), and rate-card pricing. The "money on the table" view — follow-ups are
one WhatsApp tap from each card.

## Run the Clinic

### Appointments
Day/week list with status flow (scheduled → completed / no-show / cancelled).
One-tap WhatsApp: 24-hour reminder, 1-hour reminder, no-show recovery,
post-visit survey and review request — each single-fire ("✓ Sent").

### Patients
The patient master: contact, visit history, lifetime value, outstanding
balance. CSV import from any old software (AI maps the columns — Settings →
Data Migration).

### Notes (voice notes) — feature-flagged
Dictate after a patient leaves; AI transcribes and extracts follow-ups,
recall dates, and flags into a staged proposal a human confirms. Clinical
content stays verbatim — the agent never interprets diagnoses and can never
message a patient. Audio auto-purges on a retention cron.

### Moments (Moment Capture) — NEW
Chairside result photos with a real consent record (DPDP-ready): two explicit
toggles — (A) review request OK, (B) social posting OK. Nothing saves without
consent; photos live in private storage (signed URLs only). If A: a one-tap
Hinglish Google-review ask fires — capped at **one review request per patient
per 30 days across the whole app** (surveys, captures, appointment asks). The
Gallery becomes the clinic's proof library, showing where each moment was used.

## Get Paid & Keep Them

### Payments (billing)
Invoices with GST-ready numbering, payment recording, outstanding tracking.
UPI collection links in WhatsApp dunning messages.

### Check-up Reminders (recalls)
6-month recall engine: due lists with one-tap Hinglish reminders, single-fire
stamps, aging tiers.

### Reviews
Post-visit satisfaction surveys (hosted, tokenized): happy patients get routed
to your Google review link, unhappy ones become a private complaint ticket
with an urgent notification — bad reviews intercepted before they go public.
Quarterly AI Insights report from your real survey/visit data (2 credits).

### Campaigns
Segmented WhatsApp broadcasts (e.g. "lapsed 6+ months", "kids' checkup due")
with AI-drafted Hinglish messages (1 credit) — sent one-by-one via wa.me,
tracked per send.

### Revenue Recovered
Owner-only scoreboard: every no-show recovered, due collected, and lapsed
patient reactivated through the app, converted to ₹ — the ROI proof that
renews subscriptions.

## Marketing (owner/doctor only)

### AI Visibility
Does ChatGPT / Gemini / Perplexity / Google AI Overviews recommend your
clinic? Question bank + recorded check sessions → a visibility % ring.
Free to record.

### Generate (Content Studio)
AI-written **website & operational content**: service pages, geo landing
pages, blogs, Q&A pages, treatment comparisons (all with JSON-LD schema and an
AI-Citable mode structured for AI search engines to quote), WhatsApp
broadcasts, review responses, GBP Q&A answers, reel scripts. Publish hosted
landing pages at your own URL (per-plan cap). Costs 1–3 content credits per
piece. *(Instagram/GBP feed posts moved to Social.)*

### Social (Social Content Engine) — NEW
The clinic's feed on autopilot, with a human hand on the send button:
- **Brand Personality**: a 6-question wizard (or safe default) — identity,
  audience, tone sliders, per-platform language (English/Hindi/Hinglish),
  banned phrases, CTA channel, and proof points where **claims without a
  source can never reach a post**.
- **One call, every platform**: Instagram (hook-first caption, exactly 5
  locality+service hashtags, optional 6-slide carousel), Facebook
  (conversational), Google Business (UPDATE/OFFER/EVENT with Google's content
  rules as soft warnings). 1 credit = 1 post.
- **Deterministic safety gate**: a code-level YMYL validator blocks fabricated
  statistics/prices/citations, guarantees, and banned phrases — failures
  regenerate once, then surface named. Not just prompt rules; enforcement.
- **Free branded images**: 1080×1080 posts and 6-slide carousels composed
  server-side from your logo + brand colors (zero AI images, zero credits).
- **One approval queue**: weekly planner (3 questions → 5 scheduled posts),
  per-post approval with platform-true previews, then a 3-step manual publish
  (copy caption → download images → share/mark posted). No auto-posting, no
  Instagram API — the clinic stays in control.
- Moment Capture integration: consented before/after photos compose into
  branded templates (feed + story sizes) with a non-removable "Actual patient —
  shared with consent" line, plus 3 AI caption options (1 credit) — into the
  same queue.

### Map Rank
Google Maps ranking heatmap: a 7×7 grid of real ranking checks around the
clinic per keyword (1 map credit per scan). The single most convincing visual
in a demo.

### Competitors
Rank comparison against named rival clinics on your tracked keywords.

### Deep Audit
The flagship: a 6-stage automated competitive audit — competitor discovery,
Google Business profile pull, website/PageSpeed analysis, **AI-search
visibility testing** (does ChatGPT/Gemini/Perplexity cite you — measured, with
stored evidence), scoring across 6 "moats" vs your top rivals, and an
AI-synthesized **30-day action plan** (14–20 tasks, week-paced, evidence
attached) plus a "Where You Stand" report. 1 included per subscription period;
extra audits ₹599. Auto re-runs every 30 days (with a credit), delta digest
("what moved") after each re-audit, competitor review-velocity watch, and
mid-plan nudges if the clinic stalls. Per-run API cost ≈ ₹85–105.

## Account

### Settings
Clinic info (incl. Google review link), rate card, staff & roles (Owner /
Doctor / Receptionist), landing pages, CSV data migration, feature flags.

### Upgrade
Plan status, both credit balances, deep-audit balance, plans and top-up packs
(Cashfree checkout).

### Help chatbot
In-app assistant (English/Hinglish) answering from a hand-written product KB —
page-aware suggested questions on every screen.

## Admin panel (platform owner only)
Cross-tenant `/admin` (indigo, deliberately distinct): clinics, subscriptions,
plans & packs (price control), payments, usage, **social posts per clinic**,
verticals (multi-niche seed system), system health. Super-admin gated,
404-to-everyone-else, every mutation audited.

## Under the hood (the trust bullets)
- Multi-tenant Postgres with **row-level security on every table** — isolation
  enforced in the database, not just app code.
- Patient photos & voice audio in private buckets, signed URLs only; consent
  recorded with who/when; deletion honours revocation.
- All AI calls server-side (keys never reach the browser); atomic credit
  spend with automatic refund on failure.
- Multi-vertical ready: dental today; derma/ortho/physio are seed-data jobs,
  not code forks.
