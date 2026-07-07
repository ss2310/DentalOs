# SECURITY.md — GrowthOS

Plain-language summary of the safeguards behind sensitive features. For the full
engineering rules see `CLAUDE.md`; for step-by-step verification see `TESTING.md`.

## Reporting

Found a vulnerability? Email the platform owner (see repo settings) — please
don't open a public issue with exploit details.

---

## Voice Notes & Extraction Agent

Staff can dictate a note; it's transcribed and an AI agent turns it into a
**draft** (cleaned note, tags, follow-ups, a recall, an appointment, a review
flag) that a human reviews and confirms. These are the guardrails around it.

### 1. One clinic can never see another's notes
Every voice-notes table — `clinic_notes`, `followup_tasks`, `agent_audit` — has a
`clinic_id` and is protected by Postgres **Row-Level Security**: a query only ever
returns rows for the logged-in user's own clinic (`clinic_id = current_clinic_id()`),
enforced by the database, not just app code. Stored audio lives in a **private**
bucket keyed by clinic id, so one clinic's files are invisible to another. Inserts
default `clinic_id` from the session, so it can't be spoofed by a crafted request.

### 2. The agent can never message a patient
The extraction agent has **no tool that sends anything to a patient**. "Send them
the review link" only raises a flag staff act on manually from `/reviews`. All
patient messaging stays manual `wa.me` links, as everywhere else in the product.

### 3. Nothing is saved until a human confirms
The agent's output is a **staged proposal** only. Follow-ups, recalls and
appointments become real records exclusively when a staff member reviews and hits
**Confirm** — and they can edit or drop anything first. Every agent action is
written to an append-only `agent_audit` trail.

### 4. Transcripts are treated as untrusted, and clinical detail is left alone
Dictated text is wrapped and handled as **data, never instructions** — "ignore
your rules / delete all patients" inside a transcript is captured as text, never
obeyed. Diagnoses, prescriptions and dosages stay **verbatim** in the note; the
agent never lifts them into structured fields or adds clinical interpretation.

### 5. No transcript ever lands in the logs
Application logs record **metadata only** (record ids, statuses, error objects).
The raw transcript and note text are never written to `console` at any level.
There are no info-level logs in this path; the only log lines are error
diagnostics on failure (e.g. an HTTP status), which carry no note content.

### 6. Audio is short-lived
The transcript is the record; the audio clip is disposable. It's deleted **inline
the moment a note is confirmed**, and a daily retention job clears any remaining
clip once its note is confirmed **or** it is older than **7 days** — whichever
comes first. The retention rule is pure, unit-tested code
(`lib/voice-notes-purge.mjs`; run `npm test`), so the cron job and the tested rule
can't drift apart.

### 7. You control your data (DPDP hygiene)
From **Settings → Voice Notes**, an owner or doctor can:
- **Export** every note, follow-up and audit record for the clinic as JSON.
- **Delete all** voice-note data — notes, follow-ups and stored audio — behind a
  type-to-confirm step. It's irreversible and scoped to that clinic alone.

### 8. Two independent switches gate the feature
- A **global kill-switch** (`ENABLE_VOICE_NOTES`) lets the platform disable Voice
  Notes for **every** clinic at once — a brake for cost or incident response.
- A **per-clinic toggle** (Settings) lets a clinic turn it on or off for itself.

A clinic sees Voice Notes only when **both** are on. The global switch is
server-side only and never reaches the browser.

### 9. API cost is bounded per clinic
Each clinic can create at most **100 voice notes per day** (configurable via
`VOICE_NOTES_DAILY_CAP`). The limit is checked before any audio is stored or the
AI is called, so a single tenant can't run up unbounded transcription/model spend.
