# GrowthOS — Handoff

Snapshot of the project so a new session (or person) can pick up without this
chat. Read `CLAUDE.md` first (permanent rules), then this, then `TESTING.md`
(manual test checklists per feature).

_Last updated: 2026-07-03._

---

## 1. What GrowthOS is
Multi-tenant SaaS for Indian dental clinics: (1) practice management — patients,
appointments, billing, treatment pipeline, recalls, leads, revenue recovery; and
(2) AI marketing content generation. Users are clinic receptionists/doctors on
Android Chrome + desktop. Stack: Next.js 14 (App Router) + TypeScript + Tailwind,
Supabase (Postgres + Auth + RLS), Claude API (server-side only), Vercel hosting.

Every table has `clinic_id`; every query is clinic-scoped and enforced by
Supabase RLS. See `CLAUDE.md` for the design system and non-negotiable rules.

## 2. Where the code lives
- GitHub: **https://github.com/ss2310/DentalOs** (branch `main`).
- Not yet deployed to Vercel.
- Local: `C:\Users\Utsav Goyal\Documents\GrowthOS`.

## 3. Features built (high level)
Auth + app shell; Patients; Appointments (+ 5 WhatsApp actions, inline
new-patient, cancelled/rescheduled hiding); Visit Log; Billing; Pipeline;
Recalls; Leads. Then, this build phase:
- **Notifications** — header bell + `/notifications` (per-user unread counter),
  every creation point increments the counter via `create_notification()`.
- **Scheduled jobs (pg_cron, in-database)** — morning briefing (7 AM IST) and
  weekly maintenance (Sun 00:00 IST). NOT Edge Functions; they run inside
  Supabase Postgres, independent of Vercel.
- **Operations dashboard** (`/dashboard`) and **Revenue Recovery dashboard**
  (`/recovery`, in sidebar).
- **Content Studio** (`/generate` + `/history`) — 10 post types, Claude called
  ONLY from `app/api/generate/route.ts` (model `claude-sonnet-4-6`), server-only
  key. Credits charged **per generation**; hard char limits enforced in code.
- **Settings** (`/settings`) — Clinic Info + Rate Card management.
- **Treatment Plan Presenter** — on patient detail; build a plan, send via
  WhatsApp (`treatment_plans` table).
- **Password reset** (`/forgot-password`, `/reset-password`, `/auth/callback`)
  and **Resend welcome email** on signup.

## 4. Database — migrations to run (Supabase SQL Editor, in order)
1. `001_init.sql` — schema + RLS + triggers.
2. `002_log_visit.sql` — `log_visit()` (review-notification block removed; re-run
   if you applied an older copy).
3. `003_record_payment.sql` — `record_payment()`.
4. `004_notifications.sql` — notification/read helpers + `run_morning_briefing()`
   / `run_weekly_maintenance()` + pg_cron schedules. **Enable the `pg_cron`
   extension first** (Database → Extensions), then run this file.
5. `005_seed_post_types.sql` — seeds the 10 Content Studio templates (upsert;
   safe to re-run to refresh templates).
6. `006_treatment_plans.sql` — `treatment_plans` table + RLS.

Optional: `supabase/seed_demo.sql` — realistic demo data for ONE clinic (set the
clinic UUID or owner email at the top; run once).

## 5. Environment variables
Local `.env.local` (git-ignored) and Vercel → Settings → Environment Variables:

| Var | Purpose | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | public |
| `SUPABASE_SERVICE_ROLE_KEY` | signup admin writes | server only |
| `ANTHROPIC_API_KEY` | Content Studio | server only |
| `RESEND_API_KEY` | transactional email | server only |
| `RESEND_FROM` | e.g. `GrowthOS <no-reply@yourdomain.com>` (verified domain) | server only |
| `APP_URL` | your public URL, for the welcome-email button | server only |

After editing `.env.local`, **restart `npm run dev`** — env is read only at boot.

## 6. Supabase dashboard config (one-time)
- **pg_cron**: Database → Extensions → enable, then run `004`. Verify:
  `select jobname, schedule from cron.job;` → `morning-briefing` `30 1 * * *`,
  `weekly-maintenance` `30 18 * * 6` (UTC).
- **Email SMTP** (for password-reset emails, sent by Supabase): Authentication →
  Emails → SMTP → host `smtp.resend.com`, port `465`, user `resend`, password =
  Resend API key, sender on the verified domain.
- **Redirect URLs**: Authentication → URL Configuration → add
  `http://localhost:3000/auth/callback` and `https://<vercel-domain>/auth/callback`;
  set Site URL.

## 7. Deploy to Vercel (not done yet)
1. vercel.com → Sign up with GitHub → New Project → import `ss2310/DentalOs`.
2. Add all env vars from §5 (before first deploy).
3. Deploy → get `*.vercel.app` URL → add it to Supabase Redirect URLs + Site URL
   + set `APP_URL`.
Production branch is `main`. pg_cron jobs run regardless of Vercel.

## 8. Known issues / caveats
- **Emails land in spam** — add a DMARC DNS record and confirm SPF/DKIM are green
  in Resend; new-domain reputation improves with time. (SPF/DKIM auto-set on
  domain verify; DMARC is manual.)
- **Signup pre-confirms email** (`email_confirm: true` in
  `app/signup/actions.ts`) so test clinics are instant. Before real launch: turn
  ON "Confirm email" in Supabase AND remove that flag (dashboard toggle alone
  won't enforce it for admin-created users). See TESTING.md "Deploy checklist".
- **No payments/billing system** — so no billing/subscription emails. That's a
  separate feature (Stripe/Razorpay) if/when needed.
- **Lead "Contact"** doesn't write an interaction row (`interactions.patient_id`
  is NOT NULL and a lead has no patient yet).
- Many authenticated write flows are verified by type-check + code review, not
  all clicked through live. `npx tsc --noEmit` is clean.

## 9. Suggested next steps
1. Deploy to Vercel (§7) and wire the production URL into Supabase + `APP_URL`.
2. Fix email deliverability (DMARC).
3. Walk the TESTING.md checklists on the live site, top to bottom.
4. Decide on payments (enables billing emails) when ready.
