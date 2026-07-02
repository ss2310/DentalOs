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
