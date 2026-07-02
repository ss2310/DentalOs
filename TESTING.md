# TESTING.md

Manual test checklists. Append a short checklist here after building each
feature (see rule 6 in [CLAUDE.md](./CLAUDE.md)).

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
- [ ] Sidebar lists all 10 links with icons; the current page is highlighted
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

## Deploy checklist (before onboarding real clinics)

- [ ] Turn ON Authentication > Email > Confirm email in Supabase before onboarding real clinics.
      (Signup currently creates users pre-confirmed so test clinics are instant during the build.)
- [ ] Also remove `email_confirm: true` in `app/signup/actions.ts` — because signup uses the
      admin API, that flag overrides the dashboard toggle, so the toggle alone won't enforce
      confirmation for new clinics.
