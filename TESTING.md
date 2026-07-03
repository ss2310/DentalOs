# TESTING.md

Manual test checklists. Append a short checklist here after building each
feature (see rule 6 in [CLAUDE.md](./CLAUDE.md)).

## SESSION HANDOFF

This session built the practice-management core: auth + app shell, and the
Patients, Appointments (with 5 WhatsApp actions + cancelled/rescheduled
hiding + inline new-patient), Visit Log, Billing, Pipeline, Recalls, and Leads
modules — each with its own checklist below and all queries clinic-scoped via
RLS. **What works (code + type-check + routes run):** every page compiles
(`npx tsc --noEmit` is clean) and all routes render; the RLS migration
(`001_init.sql`) is explicit/idempotent and applied. **What is NOT yet
verified end-to-end:** none of the authenticated write flows were clicked
through live by me (no test-clinic session), so treat every module's checklist
as pending. **Known blockers/caveats:** (1) migrations **`002_log_visit.sql`
and `003_record_payment.sql` must be run in the Supabase SQL Editor** — 003 was
confirmed missing earlier, so Billing's Record Payment and the Visit Log save
will fail until both are applied; (2) signup uses `email_confirm: true` (admin
API) so email confirmation must be removed in code *and* toggled in the
dashboard before launch (see Deploy checklist); (3) lead "Contact" does not
write an interaction row because `interactions.patient_id` is NOT NULL and a
lead has no patient yet; (4) the Day-3 review notification in `log_visit` is
created immediately with a TODO to become a 2-day delayed cron job.
**Next step to continue:** run `002`/`003` in Supabase, then log in as a test
clinic and walk the checklists below top-to-bottom (start with Visit Log →
Billing since those exercise the atomic Postgres functions), fixing any runtime
issues found; after that, Day-3 work is the dashboard, the delayed-notification
cron, and the AI content-generation layer (`/generate`).

## Project setup

- [ ] `npm run dev` starts and `/` renders without console errors
- [ ] Inter font is applied (no fallback serif/Arial)
- [ ] `npm run build` succeeds

## Database schema (001_init.sql)

- [ ] Migration runs clean in Supabase SQL Editor (no errors)
- [ ] All 19 tables visible in Table Editor; RLS shows "enabled" on every one
- [ ] Sign up a test user → a `profiles` row appears automatically
- [ ] With a logged-in user whose `home_clinic_id` is set, `select * from patients` returns only that clinic's rows
- [ ] With a second clinic + user, confirm clinic A's user cannot read clinic B's patients (0 rows)
- [ ] `post_types`: authenticated user can SELECT but INSERT fails
- [ ] Anonymous (no session): `select get_survey_by_token('some-token')` works; direct `select * from survey_responses` returns nothing
- [ ] `submit_survey_response` with score 4–5 returns `review_request`, 1–3 returns `private_followup`, second call on same token errors

## Authentication & app shell

Signup
- [ ] `/signup` shows all 6 fields (Clinic Name, Doctor Name, Email, Password, Phone, City)
- [ ] Email and Phone are both required; the button stays disabled until both are valid
- [ ] Invalid email (e.g. `foo@bar`) shows an inline error and blocks submit
- [ ] Phone accepts `+91 98765 43210`, `09876543210`, `9876543210` (all → 9876543210) and stores the bare 10 digits
- [ ] Phone rejects <10 digits or a number not starting with 6/7/8/9, with an inline error
- [ ] Duplicate email surfaces "An account with this email already exists." and creates no orphan clinic
- [ ] Submitting valid details creates the account and lands on `/dashboard` (no email verification step)
- [ ] In Supabase: a `clinics` row, a `profiles` row (role `clinic_owner`, `home_clinic_id` set), and 10 `rate_cards` exist for the new clinic
- [ ] Rate card prices/recalls match spec (e.g. Dental Implant ₹35000 / 90 days, RCT Single ₹4500 / 30 days)
- [ ] Signing up with an existing email shows "account already exists" and creates no orphan clinic
- [ ] Password under 6 chars is rejected with a clear message

Login
- [ ] `/` shows email + password and a link to signup
- [ ] Wrong credentials show "Incorrect email or password."
- [ ] Correct credentials redirect to `/dashboard`
- [ ] Visiting `/` or `/signup` while already logged in redirects to `/dashboard`

Route protection
- [ ] Logged out, visiting `/dashboard` (or any app route) redirects to `/`
- [ ] Logout button returns to `/` and `/dashboard` is no longer reachable

App shell
- [ ] Sidebar shows Dashboard as a top-level link, then 2 collapsible groups
      (Clinic Operations, Marketing), then Settings
- [ ] Clinic Operations = Appointments, Patients, Billing, Pipeline, Recalls,
      Leads, Recovery, Reviews; Marketing = Generate, Map Rank
- [ ] The group holding the current page is auto-expanded and its header shows in blue
- [ ] Clicking a group header toggles it open/closed (chevron rotates); child links highlight when active
- [ ] Header shows the clinic's name (left) and bell + logout (right)
- [ ] On mobile (<768px) the sidebar collapses to a hamburger; tapping it opens the drawer, tapping a link or the overlay closes it
- [ ] All tap targets are ≥44px and text ≥14px; no gradients or heavy shadows

## Patients module

List (`/patients`)
- [ ] Empty clinic shows "No patients yet. Add your first patient."
- [ ] Patients are listed newest-first (by created_at)
- [ ] Search filters live by name (partial, case-insensitive) and by phone digits
- [ ] Search with no matches shows "No patients match your search."
- [ ] Outstanding column/value shows in red only when > ₹0; revenue and outstanding use ₹ with Indian grouping
- [ ] On mobile (<768px) the table collapses to stacked cards; tap targets ≥44px

Add Patient
- [ ] "+ Add Patient" opens the popup
- [ ] Name and WhatsApp number are required; button disabled / inline error until WhatsApp is a valid 10-digit number
- [ ] WhatsApp accepts `+91`/spaces/leading-0 and stores the bare 10 digits
- [ ] Saving shows toast "Patient added ✓", closes the popup, and the new patient appears at the top without a manual refresh
- [ ] Cancel / Escape / backdrop click closes the popup without saving

Detail (`/patients/[id]`)
- [ ] Header shows name, age (from DOB), gender, area, and a WhatsApp button linking to `https://wa.me/91<number>` in a new tab
- [ ] Visiting a non-existent id shows the 404 (not found) page
- [ ] Stats row shows total visits, lifetime revenue ₹, outstanding ₹ (red if > 0)
- [ ] Visit History, Pipeline Cases, and Recalls each show their empty state on a fresh patient
- [ ] Visit rows (when present) show date, treatment, cost, paid, and a status badge (paid=green, partial=amber, pending=red)
- [ ] "Edit Patient" opens the popup pre-filled; saving shows "Patient updated ✓" and the page reflects the change
- [ ] A patient from another clinic is not reachable (RLS returns 404)

## Appointments module

Layout & navigation (`/appointments`)
- [ ] Defaults to today's appointments (Today tab active); Today/Tomorrow computed in IST (Asia/Kolkata), not UTC
- [ ] Today / Tomorrow tabs and the date picker change the day via `?date=`; picker highlights when on a custom date
- [ ] Cards sorted by time ascending; time shows as `h:mm a` (e.g. 9:30 AM)
- [ ] Each card: time, status badge (correct color), patient name (links to detail), treatment name, doctor
- [ ] Empty day shows "No appointments for {DD MMM YYYY}."

Booking
- [ ] "+ Book Appointment" opens the popup; date defaults to the selected day, doctor defaults to the clinic's doctor
- [ ] Patient combobox filters by name/phone; Book disabled until a patient is chosen
- [ ] Treatment can be left as "No treatment yet"; date and time required
- [ ] Save shows toast "Appointment booked ✓", closes, and the new card appears on that day

Inline "add new patient" (from booking)
- [ ] Typing a name with no match shows a "+ Add new patient: "{typed}"" option
- [ ] Selecting it opens a compact inline form with full_name pre-filled from the typed text
- [ ] WhatsApp number is required with the same 10-digit validation (inline error, Add disabled until valid); phone and area are optional
- [ ] "Add & select" creates the patient (clinic-scoped) and auto-selects them in the combobox so booking can be completed without leaving the popup
- [ ] Pressing Enter inside the inline fields adds the patient (does not submit/close the booking form)
- [ ] Cancel returns to the search field without creating a patient
- [ ] The new patient also appears on /patients (and their DOB/notes can be filled later there)

Status buttons (visibility)
- [ ] scheduled → shows Confirm, Reschedule, Cancel (and No Show only if the time is past)
- [ ] confirmed → Arrived, Reschedule, Cancel (+ No Show if past)
- [ ] arrived → In Chair, Complete, Reschedule
- [ ] in_chair → Complete, Reschedule
- [ ] completed → no action buttons
- [ ] No Show hidden for future appointments, visible once the appointment datetime is in the past (IST)

Hidden statuses (cancelled/rescheduled)
- [ ] By default, appointments with status rescheduled or cancelled_patient do NOT appear in the day list
- [ ] After rescheduling, the current day no longer shows the old (rescheduled) card by default; the new appointment still shows on its new date
- [ ] A "Show cancelled/rescheduled (N)" toggle appears at the top only when such rows exist for the day
- [ ] Toggling ON reveals them greyed out (reduced opacity), sorted below the active ones, with no action buttons (patient link still clickable)
- [ ] Toggling OFF hides them again; the rows remain in the DB (audit trail intact)
- [ ] A day with only cancelled/rescheduled rows shows "No active appointments" plus the toggle

Status effects
- [ ] Confirm/Arrived/In Chair advance the status and the badge updates
- [ ] Complete → status completed → navigates to `/visit-log/[id]` → a notification "Log visit for {name}" (system/routine) row is created
- [ ] No Show → status no_show → creates interaction (recovery_noshow/whatsapp), recovery_event (no_show, original_appointment set), and notification (recovery_due/urgent, "No-show: {name}. Send recovery.")
- [ ] Cancel → confirm dialog "Cancel this appointment?" → status cancelled_patient → recovery_event (cancelled) + notification (recovery_due, "Cancelled: {name}")
- [ ] Reschedule → popup with new date+time → original becomes rescheduled → a new scheduled appointment is created for the same patient/treatment/doctor → toast → view jumps to the new date showing the new card
- [ ] All new rows (appointments, interactions, recovery_events, notifications) carry the correct clinic_id and are invisible to other clinics (RLS)

## Appointments — WhatsApp actions

General
- [ ] Each WhatsApp button opens `https://wa.me/91<number>?text=...` in a NEW tab with the message pre-filled
- [ ] Messages with apostrophes/emoji/newlines are correctly encoded (no broken links); newlines appear as line breaks in WhatsApp
- [ ] After clicking, the button is replaced by a green "✓ Sent" label (anti-duplicate); a second send is not possible
- [ ] Each send creates an interaction row (correct type + channel whatsapp) with the right clinic_id (RLS)

Visibility & effects
- [ ] "Send 24h Reminder": shows only when appointment is tomorrow AND status scheduled/confirmed AND not already sent; sets reminder_24h_sent_at
- [ ] "Send 1h Reminder": shows only when today AND start is within the next 90 min AND status scheduled/confirmed AND not already sent; sets reminder_1h_sent_at
- [ ] "Recover No-Show": shows when status no_show and recovery not sent; sends → status becomes recovery_sent, recovery_sent_at set, linked recovery_event gets action_taken_date + wa_message_sent=true
- [ ] "Recover Cancelled": reachable via "Show cancelled/rescheduled" on a cancelled card; same effect with interaction recovery_cancelled
- [ ] "Request Review" is NOT shown on appointment cards anymore — review requests live only on /reviews
- [ ] Message content matches spec, with {name}, {time h:mm a}, and clinic phone interpolated correctly

## Visit log (/visit-log/[appointmentId])

Prereq
- [ ] Run supabase/migrations/002_log_visit.sql in the SQL Editor first (defines log_visit())

Form & live calc
- [ ] Top card shows patient name (large), today's date (IST), appointment time, and the appointment's treatment
- [ ] Treatment dropdown pre-selects the appointment's treatment; Doctor is pre-filled; Cost pre-fills from the treatment's base_price
- [ ] Changing the treatment re-fills the cost from the new treatment's base_price
- [ ] "Outstanding Amount" updates live: red (#DC2626) when > 0, green (#059669) when 0
- [ ] Entering paid > cost shows the cap message and disables Save

Save Visit (atomic — verify in DB after one save)
- [ ] A visit_log row is created with treatment_name_text/category snapshotted, outstanding_amount = cost − paid, correct payment_status (paid/partial/pending), created_by = current user
- [ ] If cost − paid > 0: an outstanding row (nett_due correct, age_bucket current, linked to the visit) AND a recovery_event (outstanding_payment) are created; if fully paid, neither exists
- [ ] Patient rollups updated: total_visits +1, lifetime_revenue + paid, total_outstanding + (cost − paid), last_visit_date = today
- [ ] If the treatment has recall_interval_days > 0: a recall is created (due_date = today + interval, status pending); otherwise none
- [ ] A review_due notification "Request review from {patient}" is created
- [ ] Redirects to /patients/[id] with toast "Visit logged ✓"; the Visit History section now shows the new visit with its status badge, and the stats row reflects the rollups
- [ ] Atomicity: an intentionally bad input (e.g. paid > cost) creates NO rows at all
- [ ] Re-opening the same /visit-log/[id] shows "A visit has already been logged" (no double-count), and a second submit is rejected
- [ ] A visit-log URL for another clinic's appointment 404s / is rejected (RLS + clinic checks in the function)

## Billing (/billing)

Prereq
- [ ] Run supabase/migrations/003_record_payment.sql in the SQL Editor first (defines record_payment())

Stat cards & list
- [ ] "Total Outstanding" = sum of nett_due (>0), shown large in red (#DC2626)
- [ ] "Overdue 30+ Days" = sum of nett_due where age_bucket is days_30/60/90_plus, amber
- [ ] "Patients with Balance" = count of distinct patients with a balance
- [ ] List sorted by nett_due desc; each row: patient name (bold, links to detail), visit date, treatment, total ₹, paid ₹, nett_due (bold red), age badge (current=gray, 30=amber, 60=orange, 90+=red)
- [ ] On mobile/tablet the table collapses to stacked cards
- [ ] Empty state when there are no balances

Record Payment (atomic — verify DB)
- [ ] Popup shows patient name + current nett_due
- [ ] Amount must be > 0 and ≤ nett_due (inline error + Save disabled otherwise)
- [ ] Save: outstanding amount_paid += amount, nett_due -= amount (floored at 0); patient total_outstanding -= amount, lifetime_revenue += amount
- [ ] When nett_due reaches 0: the linked recovery_event gets outcome=paid, outcome_date=today, revenue_recovered=total collected; the row drops off the list
- [ ] Toast "₹{amount} payment recorded ✓"; partial payment keeps the row with the reduced balance
- [ ] Overpay attempt is rejected server-side (no partial writes)

Remind (WhatsApp, anti-duplicate)
- [ ] "Remind" opens wa.me in a new tab with the pending-balance message and the correct ₹ amount
- [ ] Sets payment_reminder_sent_at and creates an interaction (payment_reminder)
- [ ] Within 7 days of the last reminder the button is hidden (shows "✓ Reminded"); after 7 days it returns

Patient detail
- [ ] The patient page shows an "Outstanding Balances" section listing their open balances (treatment, visit date, age badge, nett_due) or an empty state

## Pipeline (/pipeline)

Stat cards & list
- [ ] "Pipeline Value" = sum plan_value where stage not in (rejected, completed), green
- [ ] "Needs Follow-up" = count where stage=thinking AND follow_up_date <= today, amber
- [ ] "Ready to Book" = count where stage=accepted, blue
- [ ] List sorted by follow_up_date asc with nulls last; each row: patient (link), treatment, plan_value ₹, stage badge (correct colors), follow_up_date shown red when past
- [ ] Empty state when no cases

Add Case
- [ ] "+ Add Case" opens popup; patient combobox + treatment dropdown + plan value (auto-fills base_price, editable) + notes
- [ ] Save creates a case at stage=identified AND a recovery_event (deferred_treatment, original_case linked, trigger_date today); toast + row appears

Stage transitions
- [ ] Present (identified only) → presented, presented_date set
- [ ] Accepted (presented/thinking) → accepted, accepted_date set → notification "{treatment} accepted ₹{plan}. Book appointment." (important) → linked recovery_event outcome=accepted, revenue_recovered=plan_value
- [ ] Thinking (presented only) → date popup "When to follow up?" → thinking, follow_up_date set
- [ ] Rejected (presented/thinking) → reason dropdown + notes popup → rejected, rejection_reason saved → recovery_event outcome=lost
- [ ] Book (accepted only) → appointment popup with patient pre-filled & locked; on successful booking the case moves to scheduled
- [ ] Follow Up (thinking AND follow_up_date <= today) → opens wa.me with the message → last_follow_up=today, follow_up_date=today+7, recovery_event action_taken_date+wa_message_sent=true, interaction (case_follow_up)
- [ ] Buttons only show for the stages listed above; all writes are clinic-scoped (RLS)

Patient detail
- [ ] Pipeline Cases section shows the patient's cases with treatment name, stage badge, plan value, and follow-up date

## Recalls (/recalls)

- [ ] Header shows "X recalls due within 7 days" (active recalls, due_date within 7 days)
- [ ] Tabs: Due Now (active, due_date <= today), Upcoming (active, due_date > today), Completed (status=completed); default Due Now
- [ ] List sorted due_date asc; each row: patient (link), recall_type, due_date (red if overdue), source treatment (gray), status badge
- [ ] Remind → opens wa.me with the recall message → status reminded, reminder_sent_at set, interaction (recall_reminder)
- [ ] Book → appointment popup with patient pre-filled → on booking success status becomes scheduled
- [ ] Complete → status completed, completed_date set (moves to Completed tab)
- [ ] Dismiss → confirm dialog → status dismissed (drops out of all tabs)
- [ ] Patient detail Recalls section shows their recalls with the status badge

## Leads (/leads)

- [ ] Stat cards: New (status=new), Contacted (status=contacted), Converted this month (status=converted, created this month)
- [ ] "+ Add Lead" popup: name (required), phone, source dropdown, treatment interest, notes → creates lead (status new)
- [ ] List sorted created_at desc; each row: name, phone, source badge, interest, status badge, follow_up_date (red if past)
- [ ] Contact (new) → opens wa.me enquiry message → status contacted
- [ ] Interested (new/contacted) → status interested
- [ ] Book (interested) → status booked (no appointment, per spec)
- [ ] Convert (booked/interested) → creates a patient from name+phone, sets converted_to_patient_id + status converted, redirects to the new patient detail
- [ ] Lost → reason popup → status lost, lost_reason saved
- [ ] Buttons only appear for the valid statuses; all writes clinic-scoped (RLS)

## Notifications (/notifications + header bell)

Prereq
- [ ] Run supabase/migrations/004_notifications.sql (defines create_notification,
      mark_notification_read, mark_all_notifications_read, run_morning_briefing,
      run_weekly_maintenance, and registers the two pg_cron schedules)
- [ ] Re-run supabase/migrations/002_log_visit.sql (the immediate post-visit
      review notification was removed — check (b) of the briefing replaces it)

Header bell
- [ ] Bell shows a red badge = the current user's unread_notification_count; badge hidden when 0; shows "99+" above 99
- [ ] Clicking the bell navigates to /notifications
- [ ] After marking notifications read, the badge count drops (or disappears) without a manual reload

Counter integrity (each creation point increments the count)
- [ ] Completing an appointment ("Log visit for {name}") bumps the count by 1
- [ ] No Show ("No-show: {name}") bumps the count by 1
- [ ] Cancel ("Cancelled: {name}") bumps the count by 1
- [ ] Accepting a pipeline case ("{treatment} accepted…") bumps the count by 1
- [ ] Logging a visit does NOT create a notification anymore (no immediate "Request review" row)

/notifications list
- [ ] Sorted newest-first, at most 30 rows
- [ ] Left border color by priority: urgent #DC2626, important #D97706, routine #2563EB
- [ ] Unread rows have a #EFF6FF background and a bold title; read rows are white with a normal-weight title
- [ ] Body text is gray; relative time ("3h ago", "2d ago") shows at the right
- [ ] Clicking a row marks it read (title un-bolds, background clears), decrements the count, and navigates to action_url when present
- [ ] Clicking a row with no action_url marks it read and stays on the page
- [ ] "Mark all read" clears every unread row and zeroes the badge; the button is disabled when nothing is unread
- [ ] Empty state shows "✓ All caught up" in green
- [ ] A notification from another clinic never appears (RLS); another clinic's count is untouched by your activity

Morning briefing (run `select run_morning_briefing();` manually to test)
- [ ] With tomorrow's un-reminded scheduled/confirmed appts → one "X patients need 24h reminders" (important, /appointments)
- [ ] With appts completed 2–7 days ago & review_requested=false → one "X review requests pending" (routine)
- [ ] With no_show appts & recovery_sent_at null → one "X no-shows need recovery" (urgent, /appointments)
- [ ] With outstandings nett_due>0 aged 30+ → one "₹X overdue from Y patients" (important, /billing)
- [ ] With pending recalls due within 7 days → one "X recalls due this week" (routine, /recalls)
- [ ] With thinking cases follow_up_date<=today → one "X follow-ups due (₹Y)" (important, /pipeline)
- [ ] A check with count 0 creates NO notification; each notification bumps every clinic user's count
- [ ] Runs per active clinic only (is_active=true); clinics stay isolated

Weekly maintenance (run `select run_weekly_maintenance();` manually to test)
- [ ] Outstanding age_bucket recomputed from visit_date: ≤30 current, 31–60 days_30, 61–90 days_60, 91+ days_90_plus
- [ ] Notifications older than 14 days are deleted; newer ones remain

## Operations dashboard (/dashboard)

Header & stat cards
- [ ] Greeting matches the IST time of day: "Good morning" (<12), "Good afternoon" (12–16), "Good evening" (17+), with the user's first name
- [ ] Subtitle shows the clinic name and today's date (DD MMM YYYY, IST)
- [ ] "Appointments Today" = count of today's appointments whose status is NOT completed/cancelled_patient
- [ ] "Pipeline Value" = sum of plan_value for cases not in rejected/completed, green
- [ ] "Outstanding" = sum of nett_due (>0), red only when > ₹0
- [ ] "Recovered This Month" = sum revenue_recovered for positive outcomes with outcome_date in the current IST month, green

Actions Needed (6 rows, each links to the right module)
- [ ] 📩 "{X} patients need 24h reminders" → /appointments (tomorrow, scheduled/confirmed, reminder_24h_sent_at null)
- [ ] ⭐ "{X} review requests pending" → /reviews (completed 2–7 days ago, review_requested=false)
- [ ] 🔄 "{X} no-shows/cancellations need recovery" → /appointments (status no_show/cancelled_patient, recovery_sent_at null)
- [ ] 💰 "₹{X} outstanding from {Y} patients" → /billing
- [ ] 📅 "{X} recalls due this week" → /recalls (pending, due within 7 days)
- [ ] 💼 "{X} case follow-ups due (₹{Y})" → /pipeline (thinking, follow_up_date <= today)
- [ ] A row with count 0 shows a green "✓ All done" instead of the count/arrow
- [ ] The counts here match the morning-briefing notifications for the same clinic/day

Mini schedule & activity
- [ ] "Today's Schedule" lists today's first 5 active appointments (time, name, treatment, status badge), earliest first; cancelled/rescheduled excluded
- [ ] Empty state "No appointments today." when none; "View all →" links to /appointments
- [ ] "Recent Activity" shows the last 5 interactions as "{relative time} · {type label} · {patient}"
- [ ] Empty state "No activity yet." when none
- [ ] All figures reflect only the logged-in user's clinic (RLS)

## Revenue Recovery dashboard (/recovery)

- [ ] "Recovery" appears in the sidebar (with the 💰/recovery icon) and routes to /recovery; active state highlights
- [ ] Hero shows "Recovered This Month" at 36px in #059669 = sum of positive-outcome revenue_recovered this IST month
- [ ] Four breakdown cards (this month) show sum + patient count:
      No-Shows Rebooked (no_show/rebooked), Deferred Converted (deferred_treatment/accepted),
      Recalls Returned (recall_overdue/returned), Outstanding Collected (outstanding_payment/paid)
- [ ] Bar chart shows the last 6 months (oldest→newest) with bar height scaled to the max month; each bar labelled with the month and its ₹ total; zero months render as an empty slot
- [ ] Chart shows "No recovery recorded in the last 6 months yet." when all six are zero
- [ ] Audit trail lists the last 15 recovery_events with an outcome: date, patient, type badge, outcome badge (positive green, lost red), ₹ recovered (green when > 0, "—" when 0)
- [ ] Audit empty state "No recovery outcomes recorded yet." when none
- [ ] Everything is clinic-scoped (RLS); another clinic's recoveries never appear

## Content Studio (/generate + /history)

Prereq
- [ ] `ANTHROPIC_API_KEY` is set in `.env.local` (server-only; never sent to the client)
- [ ] `@anthropic-ai/sdk` is installed (`npm install` if pulling fresh)
- [ ] Run supabase/migrations/005_seed_post_types.sql in the SQL Editor (seeds the 10 post_types; upsert-idempotent)

Generate — layout & selection
- [ ] `/generate` shows a grid of 10 post-type cards, each with name, platform badge, and credit cost
- [ ] "Credits left" (monthly_credits − credits_used) shows top-right; "History →" links to /history
- [ ] Selecting a card highlights it and opens the input panel below
- [ ] Type-specific inputs render from extra_fields: Review Response shows review text + star rating; Geo Landing Page shows area name; GBP Q&A shows the question; WhatsApp Broadcast shows occasion; the rest show just Topic
- [ ] Review Response and GBP Q&A hide the Topic field; others require it

Generate — flow
- [ ] "This will use X credits" reflects the selected type's cost
- [ ] Generate is disabled until required fields are filled
- [ ] If credits left < cost, generation is blocked with a red message (and blocked server-side too — the route returns 402)
- [ ] Clicking Generate shows a spinner in the button ("Generating…") and an animated skeleton "Writing your {type}…" card, then the readable result card
- [ ] Generate and Regenerate each deduct the type's credits (the "Credits left" counter drops on every generation); Save does NOT deduct again
- [ ] The Claude call is server-side only (Network tab shows a request to /api/generate, never to api.anthropic.com; the key is not in any client bundle)
- [ ] The SHARED SYSTEM PROMPT (clinic identity + guardrails) is sent as `system` on every call; the filled template is the `user` message
- [ ] Long web types (Blog, Service Page, Geo, Blog+FAQ) use max_tokens 4000; all others 1500 (web pages don't truncate mid-page)
- [ ] Content matches the brief: GBP posts are 150–200 words, Hinglish, 3–5 emojis, no hashtags, end with clinic name + phone; review responses are empathetic and never admit fault on 1–3★ and invite offline resolution
- [ ] Guardrails hold: no medical guarantees / "best in city", no invented prices or facts, no patient medical details
- [ ] API errors show a friendly retry message (e.g. temporarily unset the key or simulate 429)

Character limits (enforced in code, not just the prompt)
- [ ] Web types output "META TITLE:" (trimmed ≤60 chars) and "META DESCRIPTION:" (trimmed ≤155 chars) on a word boundary
- [ ] A GBP post over 1,400 chars is trimmed on a word boundary; an Instagram caption is capped at 2,200

Generate — schema, WhatsApp, actions
- [ ] Service Page, Geo Landing Page, and Blog Article with FAQ generate their JSON-LD inline ("PART B — SCHEMA"); the route splits it out and it shows in a collapsible "SEO Schema (JSON-LD)" with a "Copy Schema" button (Blog+FAQ's FAQPage questions match the article's FAQ)
- [ ] WhatsApp Broadcast: the reply body shows in the result; a url-encoded "wa.me-ready text" box (encoded in code, not by the model) shows with a Copy button; the {name} token is preserved for per-patient replacement
- [ ] Copy copies the content and toasts; Regenerate asks to confirm and produces a new version
- [ ] Save creates a generated_content row (status draft, credits_deducted = cost), toasts "Saved to history ✓", and the Save button then shows "✓ Saved" (Save does not change the credit counter — generation already charged it)

History (/history)
- [ ] Lists saved content newest-first with type name, platform badge, topic, date, and status badge (draft gray / scheduled amber / published green)
- [ ] Search filters by topic / type name / body text; platform and status dropdowns filter the list
- [ ] "View content" expands the full text (and the JSON-LD schema if present)
- [ ] Copy copies the body; Mark Published sets status=published + published_date=today (button hides once published); Delete asks to confirm then removes the row
- [ ] Empty state shows "No saved content yet" (or "No content matches your filters")
- [ ] Everything is clinic-scoped (RLS); another clinic's content never appears

> Credits note: credits are charged **per generation** (Generate and Regenerate each cost a real API call) in app/api/generate/route.ts, which also blocks when the clinic can't afford the next generation. Save persists the draft and records `credits_deducted` but does not charge again.

## Settings (/settings)

Clinic Info tab
- [ ] Form is pre-filled from the clinic row (business_name, doctor_name, phone, address, city, area, google_review_url, instagram_handle, website_url)
- [ ] Clinic name and a valid 10-digit phone are required; invalid phone shows an inline error and blocks save
- [ ] Save shows toast "Clinic details saved ✓"; the header clinic name updates without a manual reload
- [ ] Empty optional fields are stored as NULL

Rate Card tab
- [ ] Active treatments show in a table (name, category, ₹ price, duration, recall days); collapses to stacked cards on mobile
- [ ] "+ Add Treatment" opens a popup; name + price required; Save adds an active treatment and it appears in the table
- [ ] "Edit" opens the popup pre-filled; saving updates the row
- [ ] "Deactivate" asks to confirm, sets is_active=false (never deletes); the row moves to the collapsed "Deactivated (N)" section
- [ ] "Reactivate" in the deactivated section restores it to the active table
- [ ] A deactivated treatment no longer appears in booking / visit-log / treatment-plan dropdowns; existing visit history is unaffected
- [ ] All writes are clinic-scoped (RLS)

## Treatment Plan Presenter (patient detail)

Prereq
- [ ] Run supabase/migrations/006_treatment_plans.sql (creates treatment_plans + RLS)

Create & list
- [ ] The patient page shows a "Treatment Plan" section with a "+ Create Plan" button
- [ ] "Create Plan" opens a popup: plan name, plus line-item rows (treatment dropdown + auto-filled, editable price)
- [ ] Selecting a treatment auto-fills its price from the rate card; the price is editable
- [ ] "+ Add treatment" adds a row; the ✕ removes one (can't remove the last)
- [ ] The live Total updates as items/prices change
- [ ] Save requires a plan name and at least one treatment; on save it stores a treatment_plans row (items jsonb, total_cost) and the plan appears in the list with its total and date
- [ ] Empty state "No treatment plans yet." when none

Send to Patient (WhatsApp)
- [ ] "Send to Patient" opens wa.me in a new tab to the patient's number with the plan message
- [ ] Message format matches spec: "🦷 *Treatment Plan*", Patient/Doctor lines, each item "{name} - ₹{cost}", "*Total: ₹{total}*", then "{clinic} | {phone}"
- [ ] Bold survives encoding: the asterisks render as **bold** in WhatsApp (encodeURIComponent leaves * literal); newlines appear as line breaks; ₹ and emoji encode correctly
- [ ] After sending, the button is replaced by a green "✓ Sent" (sent_to_patient=true; anti-duplicate)
- [ ] "Send" is disabled when the patient has no WhatsApp number
- [ ] Plans are clinic-scoped (RLS); another clinic's plans never appear

## Scheduled functions — Supabase dashboard steps (do once)

1. **Enable pg_cron.** Dashboard → **Database** → **Extensions** → search `pg_cron`
   → toggle **ON** (schema `pg_cron`/default is fine).
2. **Run the migration.** Dashboard → **SQL Editor** → paste all of
   `supabase/migrations/004_notifications.sql` → **Run**. The `do` block at the
   bottom registers both jobs via `cron.schedule`. (If you ran the file *before*
   enabling pg_cron, it prints a NOTICE and skips scheduling — just run it again.)
3. **Verify the schedule.** In the SQL Editor run `select jobname, schedule,
   command from cron.job;` — you should see `morning-briefing` at `30 1 * * *`
   and `weekly-maintenance` at `30 18 * * 6` (UTC; = 7:00 AM IST daily and
   Sunday 00:00 IST weekly).
4. **Smoke test now (optional).** Run `select run_morning_briefing();` and
   `select run_weekly_maintenance();` in the SQL Editor and confirm rows appear
   in `notifications` / the bell badge updates.

No Edge Function deploy is needed: both jobs are pure SQL run in-database by
pg_cron, so there is nothing to `supabase functions deploy` and no service-role
key to store. (If you later add work that must call an external API, move it to
an Edge Function and swap the cron command for a `net.http_post` to the function
URL — not required for anything in this milestone.)

## Password reset & welcome email

Supabase config needed for real delivery (dashboard, do once)
- [ ] Authentication → Emails → **SMTP Settings**: enable custom SMTP with Resend —
      host `smtp.resend.com`, port `465`, user `resend`, password = your Resend API
      key, sender = a verified `from` address
- [ ] Authentication → URL Configuration → **Redirect URLs**: add
      `http://localhost:3000/auth/callback` and `https://<your-vercel-domain>/auth/callback`
- [ ] Set **Site URL** to your production URL
- [ ] Vercel env: add `RESEND_API_KEY` and `RESEND_FROM` (server-only) for the welcome email

Forgot-password flow
- [ ] Login page shows a "Forgot password?" link → /forgot-password
- [ ] Submitting an email shows "Check your email ✓" (same message whether or not the account exists — no enumeration)
- [ ] The reset email link opens /auth/callback, which exchanges the code and lands on /reset-password (logged in via recovery session)
- [ ] /reset-password requires the new password ≥6 chars and both fields to match (inline errors otherwise)
- [ ] Saving updates the password and redirects to /dashboard; the new password works on next login
- [ ] An expired/invalid link redirects to /forgot-password with an "invalid or expired" message
- [ ] Visiting /reset-password directly (no recovery session) is bounced to / by middleware

Welcome email
- [ ] Completing signup sends a branded welcome email to the new owner (subject "Welcome to GrowthOS, {clinic}!")
- [ ] Signup still succeeds and lands on /dashboard even if email sending fails or Resend is unconfigured (best-effort, non-blocking)

## Deploy checklist (before onboarding real clinics)

- [ ] Turn ON Authentication > Email > Confirm email in Supabase before onboarding real clinics.
      (Signup currently creates users pre-confirmed so test clinics are instant during the build.)
- [ ] Also remove `email_confirm: true` in `app/signup/actions.ts` — because signup uses the
      admin API, that flag overrides the dashboard toggle, so the toggle alone won't enforce
      confirmation for new clinics.

## Reviews page (/reviews)

- [ ] The sidebar "Reviews" link opens /reviews (previously 404'd — page now exists)
- [ ] Summary cards show correct "Pending Requests" and "Requested This Month" counts
- [ ] If the clinic has no Google review URL set (Settings), a warning banner appears and
      links to /settings; the WhatsApp message still sends but without a link
- [ ] "Pending Review Requests" lists completed appointments from the last 30 days that
      haven't been requested yet (patient name, date/time, treatment)
- [ ] "Request Review" opens a wa.me tab with the Hinglish review message + Google link,
      then the row flips to "✓ Sent" (anti-duplicate) without a full reload
- [ ] A completed appointment with no WhatsApp number shows "No WhatsApp number" (no button)
- [ ] Reviews are handled only here — appointment cards no longer show a "Request Review" button
- [ ] "Recently Requested" lists already-requested visits with the request date and ✓ Sent
- [ ] Multi-tenant: only the logged-in clinic's completed appointments appear (RLS-scoped)
- [ ] Mobile: cards stack, tap targets ≥44px, no horizontal scroll

## Page layout consistency (shared primitives in components/page.tsx)

- [ ] Billing, Pipeline, Leads, Recalls, Reviews, Recovery, Patients all read the same
      top-to-bottom: page title → stat cards → uppercase section header → list/table
- [ ] Stat-card numbers are colour-coded by meaning: green = money/positive, amber =
      needs attention, red = overdue/bad, blue = neutral info
- [ ] Each list's section header shows a sort hint (e.g. "Highest balance first",
      "Newest first", "Soonest follow-up first", "Earliest due first") and the rows
      actually follow that order
- [ ] Empty states use the same bordered card style across all pages
- [ ] Spacing is even — no double gaps between the section header and the list on
      desktop or mobile (check both table and stacked-card breakpoints)
- [ ] Patients: section header reads "All Patients", switches to "N results" while searching

## List grouping by state (Pipeline / Leads / Billing)

- [ ] Pipeline: cases are split into per-stage sections (Accepted, Thinking, Presented,
      Identified, Scheduled, Completed, Rejected) in that order; only non-empty stages show;
      each header shows a "N cases" count; within a stage, soonest follow-up is first
- [ ] Leads: split into per-status sections (New, Contacted, Interested, Booked, Converted,
      Lost) in that order; only non-empty statuses show; header shows "N leads"; newest first within
- [ ] Billing: split into age-band sections (90+ days, 60+ days, 30+ days, Current) in that
      order; each header shows the "₹X due" total for that band; highest balance first within;
      the per-row Age badge/column is gone (the section header conveys it)
- [ ] Each grouped page's empty state still shows a single section header + empty card
- [ ] Recalls (tabs) and Reviews (Pending / Recently Requested) already group by state — unchanged

## Dashboard — Book Appointment quick action

- [ ] Dashboard header shows a primary "Book Appointment" button (right of the greeting;
      collapses to "Book" on mobile, ≥44px tap target)
- [ ] Clicking it opens the same booking modal used on /appointments (patient combobox,
      inline "add new patient", date defaults to today, doctor defaults to the clinic doctor)
- [ ] Booking a slot shows "Appointment booked ✓", closes the modal, and the dashboard
      refreshes so "Appointments Today" and the mini schedule reflect the new booking
- [ ] The new appointment also appears on /appointments (bookAppointment revalidates it)

## Migration 007 — growth features (schema)

Run `supabase/migrations/007_growth_features.sql` in the Supabase SQL Editor. It is
additive + idempotent (safe to re-run). Schema only — no app UI yet.

Structure
- [ ] Runs with no errors; re-running it a second time also succeeds (idempotent)
- [ ] 7 new tables exist: rank_tracking_keywords, rank_scans, prospect_audits,
      ai_visibility_queries, ai_visibility_checks, automation_rules, landing_pages
- [ ] Every new table shows RLS **enabled + forced** (Table editor → each table → RLS on)
- [ ] `profiles.is_agency` (bool, default false) and `clinics.default_lat`,
      `clinics.default_lng`, `clinics.booking_slug` columns exist
- [ ] Functions exist: is_agency(), get_prospect_audit_by_token(text),
      get_published_landing_page(text, text)

Clinic isolation (log in as clinic A; run in SQL editor is service-role, so test via the app or `set role`)
- [ ] Inserting a rank_tracking_keywords / landing_pages row with your own clinic_id works;
      with another clinic_id is rejected by WITH CHECK
- [ ] Selecting rank_scans / ai_visibility_* / automation_rules returns only your clinic's rows

Agency scoping (prospect_audits)
- [ ] With is_agency = false on your profile: select/insert on prospect_audits returns nothing / is denied
- [ ] After setting is_agency = true on your own profile: you can insert (created_by = your uid)
      and read back only your own audits
- [ ] You cannot read another user's prospect_audits even with is_agency = true

Public (anon) token reads — no other anon access
- [ ] `select * from get_prospect_audit_by_token('<share_token>')` returns that one audit's
      public fields when called with the anon key; a wrong/empty token returns 0 rows
- [ ] Direct anon `select * from prospect_audits` returns nothing (RLS blocks; only the fn works)
- [ ] `select * from get_published_landing_page('<clinic booking_slug>','<page slug>')` returns a row
      only when the page status = 'published'; draft pages and unknown slugs return 0 rows
- [ ] Direct anon `select * from landing_pages` returns nothing

## Grid Rank Tracker (/rank) + SERP adapter

Provider layer (verified by a compiled unit test; also re-checkable in code)
- [ ] `SERP_PROVIDER` unset or unknown → mock adapter (free, offline, deterministic)
- [ ] Serper adapter: POST https://google.serper.dev/maps, X-API-KEY header, ll=@lat,lng,14z,
      reads `places[]` (position/title/rating/ratingCount/website/placeId)
- [ ] SerpApi adapter: GET serpapi.com/search?engine=google_maps&type=search, ll=@lat,lng,14z,
      reads `local_results[]` (position/title/rating/reviews/website/place_id)
- [ ] API keys never reach the client (adapters + index + budget are `import "server-only"`)
- [ ] generateGrid: 3/5/7 → 9/25/49 points; gridSize 9 caps to 7; latOffset=stepKm/111
- [ ] Target match: exact place_id first, else fuzzy (case/punctuation-insensitive, partial); else null

Cost guard (monthly per-clinic scan allowance)
- [ ] Budget = this clinic's rank_scans rows in the current calendar month (RLS-scoped,
      no service role) vs SERP_MONTHLY_SCAN_CAP (default 15); one scan = 1 regardless of grid size
- [ ] Run Scan confirm shows "uses 1 of your 15 monthly scans (N left this month)"
- [ ] With cap reached (e.g. SERP_MONTHLY_SCAN_CAP=1 after one scan): Continue is disabled and
      runScan refuses server-side with a "credit top-ups coming" message
- [ ] Each rank_scans row still stores provider + requests_made = grid points scanned
- [ ] Data source: mock shows the yellow "Sample data" banner; serper/serpapi hide it (live)

UI (/rank)
- [ ] "Map Rank" appears under Marketing in the sidebar
- [ ] "+ Add Keyword" prefills target business = clinic business_name and centre = clinic default_lat/lng;
      grid size defaults to 5, radius to 3
- [ ] List shows each keyword with last avg rank, % top-3, last scanned; "Not scanned yet" before first scan
- [ ] Header line shows "This month: X/15 scans used"
- [ ] Keyword detail: Run Scan → mock scan completes, big "Average Map Rank" + "In Top 3 %" appear
- [ ] Heatmap: colours 1–3 green, 4–7 light-green, 8–10 yellow, 11–15 orange, 16–20 red, not-found grey ✕;
      each cell shows its rank; tapping a cell reveals its lat/lng
- [ ] avg_rank treats not-found as 21 in the mean; pct_in_top3 = cells ranked 1–3
- [ ] History lists scans newest-first with date + avg rank; plain-div trend bars (taller = better)
- [ ] Multi-tenant: only your clinic's keywords/scans are visible (RLS)

## Competitor Intelligence (/competitors)

Data source (no extra API calls)
- [ ] Each rank_scans row created after migration 008 stores a `competitors` jsonb aggregate;
      it is computed from the top-10 local results the scan already fetched — running /competitors
      makes ZERO new SERP requests (requests_made is unchanged by opening this page)
- [ ] Scans created before 008 have `competitors = null`; /competitors ignores them and asks for a
      fresh scan
- [ ] buildCompetitorSummary is pure (no network/DB): target row excluded from rivals by fuzzy
      name match; empty target name never swallows every competitor

UI + selector
- [ ] "⚔ Competitors" (crossed-swords icon) appears under Marketing in the sidebar, for all clinic users
- [ ] No keywords at all → empty state "Run a Map Rank scan first — competitor data comes from it."
      with a link to /rank
- [ ] Keyword picker lists tracked keywords; "Analyze latest scan" loads that keyword's newest scan
      (?k=<id>); button disabled until you pick a different keyword
- [ ] Selected keyword with no competitor-bearing scan → same empty state, linking to scan that keyword
- [ ] mock provider shows the yellow "Sample data" banner; serper/serpapi hide it

Biggest threat card
- [ ] Names the rival with the highest cells_beating_target; shows "beats you in X of {total} areas"
- [ ] Reviews / rating / website each show them-vs-you; the metric is red when the rival is ahead
- [ ] When the rival has a website and you don't, a ⚠ "quick win" note appears
- [ ] If no rival outranks you anywhere → green "No rival is beating you" card instead

You-vs-competitors table
- [ ] Sorted by cells_beating_target desc; YOUR row is pinned at top and colour-highlighted (primary)
- [ ] Columns: business, avg rank (yours on your row for contrast), reviews (red ▲ if more than yours),
      rating (red if higher than yours), website (⚠ on any gap), beats-you X/{total}
- [ ] Desktop shows an aligned table; mobile collapses to stacked cards (your card pinned first)

Share of local pack
- [ ] Horizontal plain-div bars (no chart lib): you + top 5 rivals by top-3 appearances
- [ ] Percentages are each business's share of all top-3 Map slots across the grid (they sum to ~100%)

Gap map
- [ ] gridSize×gridSize heatmap: green ✓ you're top-3 here · amber • rival leads but you're present ·
      red ✕ you're absent while rivals rank · grey – no data
- [ ] Tapping a cell shows its lat/lng and who leads there; the section hint counts absent areas

Trend (multiple scans only)
- [ ] Shown only when the keyword has >1 competitor-bearing scan
- [ ] For the top 3 threats, plain-div bars of cells_beating_target across scans (oldest→newest);
      taller = they beat you in more areas (rival gaining)

Copy summary
- [ ] "Copy Competitor Summary" copies a plain-text block (your position, top 3 threats, biggest gap)
      to the clipboard for WhatsApp/reports; toast confirms

Multi-tenancy
- [ ] Only your clinic's keywords/scans/competitor data are visible (rank_scans RLS, clinic-scoped)

## Agency Prospecting — Competitor Intelligence (/prospect + public /audit)

Access control (agency-only)
- [ ] "🔎 Prospecting" appears in the sidebar ONLY when the logged-in profile has is_agency = true
- [ ] A non-agency user visiting /prospect or /prospect/[id] is redirected to /dashboard
- [ ] runAudit rejects non-agency callers server-side ("agency accounts only"), on top of
      prospect_audits RLS (created_by = auth.uid() AND is_agency())
- [ ] prospect_audits is agency-scoped, NOT clinic-scoped (no clinic_id involved)

New audit + run (reuses the SERP adapter + R2b aggregation)
- [ ] "+ New Audit" collects business, area, city, keyword, centre lat/lng, grid (default 5),
      radius (default 3), optional place_id
- [ ] Confirm-cost-first: the modal states "makes N requests, uses 1 of your {cap} monthly audits
      (M left)"; Run Audit disabled when over the monthly cap (AGENCY_MONTHLY_AUDIT_CAP, default 30)
- [ ] Run Audit grid-scans the target, aggregates competitors with the SAME buildCompetitorSummary
      as the clinic feature, computes avg_rank / pct_in_top3, generates findings, and stores a
      prospect_audits row (random share_token, provider, requests_made); ai_visibility_summary = null
- [ ] Every-point-failure does NOT save a blank audit (error toast instead)
- [ ] On success, redirects to the audit detail

Findings (plain-English flags, computed from the aggregate)
- [ ] "Not in the top 20 for '{keyword}' across X% of {area}" (when the business is absent anywhere)
- [ ] Top-3 coverage line; "N of the top 5 competitors have more reviews (avg vs yours)"
- [ ] "No website is listed on the Google Maps profile" only when the target has_website is false
- [ ] "Beaten by {top competitor} in X% of the grid"

Audit detail (agency view)
- [ ] Back link, business + area/city + keyword + date header
- [ ] Metrics (avg rank, in-top-3 %), the colour grid (reused Heatmap — red/grey cells are the hook)
- [ ] Reused R2b competitor table (target pinned as youLabel = business name)
- [ ] Findings list
- [ ] "Copy shareable link" copies {NEXT_PUBLIC_APP_URL or window.origin}/audit/{share_token}
- [ ] "Add AI Visibility results" links to /prospect/[id]/ai-visibility (intentionally 404s until R4)
- [ ] /prospect list shows each audit (business, area, avg rank, date) + a "Share link ↗" to the report

Public report (/audit/[token] — no login)
- [ ] Middleware treats /audit/* as public (reachable while logged out)
- [ ] Reads ONLY via get_prospect_audit_by_token(); a guessed/blank token → notFound (nothing leaks);
      direct anon select on prospect_audits still returns nothing
- [ ] Mobile-first, branded to the prospect: headline "How visible is {business} on Google Maps in {area}?"
- [ ] Colour grid + Average Map Rank + In Top 3 %
- [ ] "Who's winning instead" competitor table; "What's holding you back" findings
- [ ] AI-search section renders ONLY when ai_visibility_summary is non-null (per-engine cited/mentioned/
      not-cited badges); hidden while null
- [ ] Closing CTA line comes from the AUDIT_CTA constant (edit one line to change it)
- [ ] Desktop shows the aligned table; at 375px it collapses to stacked cards

## Content Studio — AI-Citable Mode + citable content types (/generate, /history)

Migration
- [ ] Run `009_citable_content.sql` (adds `generated_content.citable_mode` + seeds 5 new
      "Website" post types). Before it's run: /generate PART 1 still works on the existing web
      types, and /history + Save degrade gracefully (no badge, no crash) via the code fallbacks.

AI-Citable Mode toggle (PART 1)
- [ ] The "✨ AI-Citable Mode" toggle appears ONLY on web-crawlable types (platform "Website":
      Blog Article, Service Page, Geo Landing Page, Blog Article with FAQ + the 5 new types)
- [ ] Toggle is HIDDEN for GBP, Instagram, Reel, WhatsApp, Review Response, GBP Q&A
- [ ] Toggle defaults ON; helper reads "Structures the page so ChatGPT, Gemini & Perplexity can quote it."
- [ ] ON → the route injects AI_CITABLE_BLOCK into the system prompt (answer-first 40–60w, question
      headings, entity-named sentences, HTML tables for all numbers, "Last updated: {{today}}", NAP,
      schema) + the HARD YMYL rules; OFF → generates as before
- [ ] `{{today}}` (DD MMM YYYY, IST) and `{{year}}` are available to every template
- [ ] max_tokens = 4000 for all Website types (tables + schema + guide length)
- [ ] Citable web generations get their JSON-LD split into the collapsible "SEO Schema" block even
      for types without an inline PART B in their template (e.g. Blog Article)

New citable post types (PART 2, all platform "Website")
- [ ] City Dental Stats (3 cr): tables built ONLY from the supplied "stats data"; any missing figure
      shows "[clinic to supply: …]"; never invents a number; Article (+ Dataset) schema
- [ ] Treatment Comparison (3 cr): comparison table (Option/cost/time/visibility/maintenance/best-for/
      age); cost+time cells use supplied data or a placeholder, never invented; Article + FAQPage
- [ ] Clinician Guide (YMYL) (3 cr): author bio uses ONLY the supplied credentials; References lists
      ONLY supplied links, else "Sources: Indian Dental Association, WHO" + "[clinic to add specific
      references]" — never a fabricated citation/DOI; Article + MedicalWebPage
- [ ] Dental Update / What's New (2 cr): dated news post, "Published: {{today}}", headline includes
      {{year}}; Article with datePublished = today
- [ ] Question Answer Page (1 cr): question as H1, self-contained 40–60w answer directly below;
      QAPage schema

YMYL safety (applies even with the toggle OFF, via the templates)
- [ ] No fabricated statistics, costs, success rates, citations, journals, DOIs, or credentials
- [ ] Missing data → visible "[clinic to supply: …]" placeholder, never an invented value
- [ ] No outcome guarantees / superlatives

History (PART 3)
- [ ] Generations saved with citable mode on show a "✨ Citable" pill in /history
- [ ] Schema still shows in the collapsible block with Copy Schema (generate + history), save flow unchanged

---

## Reviews → Insights: Monthly Insight Report

Migration
- [ ] Run `010_insight_report.sql` (seeds the `Insight Report` post type, platform `Internal`,
      2 credits). Before it's run: the Insights tab shows the "isn't set up yet — run
      010_insight_report.sql" hint and the Generate button is disabled (no crash).

Tabs
- [ ] /reviews shows two tabs: "Review Requests" (default) and "Insights"
- [ ] Switching tabs keeps the requests list + stats intact (server-rendered); Insights tab is its
      own panel
- [ ] Tab buttons are ≥44px tall; active tab has the teal underline

Generate Monthly Insight Report
- [ ] One button "Generate Monthly Insight Report" labelled "Uses 2 credits"
- [ ] Credits-left shows in the panel; on success it drops by exactly 2 (deducted once, after a
      successful generation — same pattern as /api/generate)
- [ ] Blocked when remaining credits < 2: button disabled + "Not enough credits" message (block at 0)
- [ ] Clicking shows a "Reading your last 90 days…" skeleton, then renders the report in a card
- [ ] The report has exactly 4 labelled sections in order: "What patients love", "What's hurting
      you", "One number to watch", "Do these 3 things this month" (3 = a numbered list of 3 actions)
- [ ] Tone is plain-English / Hinglish-friendly, no jargon
- [ ] Copy button copies the report text (toast "Copied ✓")

Data gathering (last 90 days, all RLS-scoped to the clinic)
- [ ] Uses survey_responses (scores + comments, responded within 90d), interactions counts by type,
      appointment no-show rate (no_show / reached-their-date), and recovery_events outcomes + ₹ recovered
- [ ] No fabricated facts: report only reflects patterns present in the supplied data
- [ ] Thin/empty data → the report says so honestly (e.g. "not enough survey responses yet") instead
      of padding; if there is NO activity at all in 90 days, generation is blocked with a friendly
      message and no credit is spent
- [ ] The Claude call is server-side only (server action); ANTHROPIC_API_KEY never reaches the client;
      model claude-sonnet-4-6, max_tokens 1500

Saved to history
- [ ] Each report is saved as a generated_content row (topic "Monthly Insight — Mon YYYY", status
      draft, credits_deducted 2) and appears in /history with the `Internal` platform badge
- [ ] The `Insight Report` type does NOT appear in the /generate Content Studio grid (Internal excluded)
- [ ] Revisiting /reviews → Insights shows the most recent saved report in the card (with its date)
