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

## Deploy checklist (before onboarding real clinics)

- [ ] Turn ON Authentication > Email > Confirm email in Supabase before onboarding real clinics.
      (Signup currently creates users pre-confirmed so test clinics are instant during the build.)
- [ ] Also remove `email_confirm: true` in `app/signup/actions.ts` — because signup uses the
      admin API, that flag overrides the dashboard toggle, so the toggle alone won't enforce
      confirmation for new clinics.
