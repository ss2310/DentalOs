# HANDOFF — GrowthOS

Read `CLAUDE.md` first (permanent rules), then this, then `TESTING.md` (manual
checklists per feature).

Last updated: **04 Jul 2026** (subscriptions + admin-panel session). Branch:
**`growth-features-serp`**.

> ⚠️ **CRITICAL STATE — nothing this session is committed.** The entire working
> tree below is **uncommitted** (see `git status`). Last commit is still
> `11ba012`. Migrations **016, 017, 018, 019 have all been APPLIED to the DB by
> the user**, but the app code that uses them is only on disk. Decide a commit
> plan early (see §8).
>
> The prior session's handoff (security hardening / Serper) is preserved in git
> history at commit `11ba012`; its still-open items are carried forward in §6.

---

## 0. TL;DR — what this session shipped

Five workstreams, all `tsc --noEmit` + `next lint` clean, dev server boots:

1. **Post-visit survey system** (migration 016) — public star survey + routing.
2. **Campaigns** (`/campaigns`, no migration) — segmented WhatsApp retention.
3. **UPI Payment Links** (migration 017) — `upi://pay` deep links on billing.
4. **Subscriptions & credit metering** (migration 019) — **SCHEMA ONLY, not
   wired into app logic yet.** This is the biggest open thread (§4, §5).
5. **Admin panel foundation** (`/admin`, migration 018) — platform-owner only.

The only **runtime-verified** thing is the admin 404 gate (§5). Everything else
is type/lint-verified but **not click-tested** (no logged-in session in this env).

---

## 1. Migration state

| # | File | Applied? | Adds |
|---|---|---|---|
| 016 | `016_post_visit_survey.sql` | ✅ | survey_responses.appointment_id + notification_id; `get_survey_page_by_token`; `submit_survey_response` now raises the urgent low-score notification; `mark_survey_handled` |
| 017 | `017_clinic_upi_id.sql` | ✅ | `clinics.upi_id` |
| 018 | `018_admin_panel.sql` | ✅ | `is_super_admin` col+fn (idempotent, also in 019); `clinics.vertical` + `feature_flags`; `admin_audit`; `admin_clinics_overview()` (service-role only) |
| 019 | `019_subscriptions_credits.sql` | ✅ | `plans`, `credit_packs`, subscription cols on `clinics`, `credit_ledger`, `billing_events`; **clinics UPDATE column-lock**; seeds |

`015`'s `credit_transactions` (reserve/refund ledger) is **untouched** — see §3.

---

## 2. What shipped, by feature

### A — Post-visit survey (migration 016)

**Flow:** completed visit → staff taps **Send Survey** on `/reviews` → wa.me link
to `{APP_URL}/s/{token}` → patient rates 1–5 → 4–5 routes to a Google review CTA;
1–3 opens a private comment box + fires an **urgent** notification to staff.

- **Public page** (anon, no login): `app/s/[token]/page.tsx`,
  `survey-form.tsx`, `actions.ts`. `/s/` added to middleware public paths.
- **Trigger + management** (`/reviews`): `post-visit-actions.tsx` (Send Survey +
  Request Review, anti-dup), `survey-actions.ts` (`sendSurvey`,
  `markSurveyHandled`), `survey-row-actions.tsx`, `reviews-tabs.tsx` (now 3 tabs:
  Post-Visit · Survey Responses · Insights), `reviews/page.tsx` (rewritten).
- **Dashboard** `dashboard/page.tsx` — "Patient Satisfaction" card (avg this
  month + count, red when an unhandled 1–3 exists).
- `.env.local.example` documents `NEXT_PUBLIC_APP_URL`.
- **Note:** low-score submit is one atomic RPC (score+comment+notification). No
  `interactions` row for surveys (enum has no survey type) → not in Recent Activity.

### B — Campaigns (`/campaigns`, NO migration)

Tables (`campaigns`, `campaign_sends`) + enums already existed in 001.

- Sidebar 📣 **Campaigns** under "Get Paid & Keep Them" (`icons.tsx`
  `CampaignsIcon`, `app-shell.tsx`).
- `app/(app)/campaigns/`: `segments.ts` (5 segments + `fillCampaignTemplate`),
  `actions.ts` (`previewSegment`, `createCampaign`, `draftCampaignMessage` = AI, 1
  credit via the atomic reserve/refund pattern, `sendCampaignMessage`,
  `markCampaignDone`), `new-campaign.tsx` (live preview + AI draft), `page.tsx`
  (list), `[id]/page.tsx` (detail: progress bar + recipient list), `[id]/
  campaign-controls.tsx`.
- **Deliberately one-tap-per-patient** (no bulk send — wa.me can't, and it keeps
  the clinic number ban-safe). Recipients **snapshotted** into
  `segment_filter.patient_ids` at save. 14-day "recently messaged" guardrail.
- AI draft is **admin-only** (matches `/api/generate` credit-spend gate); button
  hidden for receptionists. `sent_count` recomputed from the ledger on each send.
- Partially delivers the old "bulk WhatsApp campaigns" backlog item.

### C — UPI Payment Links (migration 017)

- `lib/upi.ts` — `isValidUpiId`, `upiMessage` (the exact Hinglish message + the
  `upi://pay?pa=…&pn=…&am=…&cu=INR&tn=DentalBill` deep link).
- **Settings** — UPI ID field (`clinic-info-form.tsx`, `settings/page.tsx` select,
  `settings/actions.ts` loose validation + save).
- **Billing** — `page.tsx` builds per-row `upiUrl`; `billing-actions.tsx` shows
  **Request via UPI** on each row **and** in the Record Payment popup. It
  **reuses `remindPayment`**, so it shares the 7-day anti-dup (`payment_reminder_
  sent_at`) + logs a `payment_reminder` interaction — Remind and UPI collapse to
  "✓ Reminded" together.
- **Treatment plan presenter** — `patients/[id]/page.tsx` passes `upiId`;
  `treatment-plans.tsx` adds a per-plan editable ₹ amount + Request via UPI for
  advance collection (open-WhatsApp only; no DB write, pre-outstanding).
- Confirmation is **MANUAL** — no webhook / reconciliation (by design).

### D — Subscriptions & credit metering (migration 019) — ⚠️ SCHEMA ONLY

**No app code was written for this — the migration is applied and seeded, and
the admin panel *reads* the new columns, but NOTHING writes/decrements them yet.**
See §4 for the wiring work. Migration contents:

- **`plans`** + **`credit_packs`** (global catalogs; read = any authenticated,
  write = super-admin only). Seeded: `Free Trial`, `Growth Monthly`; four
  top-up packs. **Prices seeded at 0 — user sets them in the admin panel later.**
- **`profiles.is_super_admin`** + `is_super_admin()`.
- **`clinics`** new cols: `subscription_status` (trial/active/past_due/
  deactivated/cancelled), `plan_id`, `trial_started_at/ends_at`,
  `current_period_end`, `content_credits_balance` (default 50),
  `map_credits_balance` (default 4), `billing_provider`, `provider_customer_id`,
  `provider_subscription_id`, `last_payment_at`, `deactivated_at`.
- Existing clinics **grandfathered**: `content_credits_balance = max(monthly_
  credits - credits_used, 0)`, `map = 4`, status `active`. (One-time snapshot —
  now frozen; nothing updates it yet.)
- **`credit_ledger`** (clinic-scoped, read-only to clinic) — the per-balance-
  change ledger. **Renamed from the spec's `credit_transactions`** (see §3).
- **`billing_events`** (super-admin readable) — audit of billing lifecycle.
- **clinics UPDATE column-lock** (§3) — closes a real hole.

### E — Admin panel foundation (`/admin`, migration 018)

Platform-owner-only, cross-tenant. Gated on `is_super_admin`.

- **Access** `lib/admin/auth.ts` — `isSuperAdmin`, `requireSuperAdmin` (→
  `notFound()`), `requireAdminContext()` → `{ adminId, db }` where `db` is the
  service-role client handed out ONLY after re-verifying super-admin; `writeAudit`.
- **Middleware** `lib/supabase/middleware.ts` gates `/admin` + `/api/admin` →
  **404, never 403** (pages via rewrite to unmatched, API via JSON 404).
- **CLAUDE.md** — new **`## Admin panel rules`** section (service-key invariant,
  404-not-403, defense-in-depth, indigo accent).
- **Shell** `app/admin/layout.tsx` + `admin-nav.tsx` — distinct **indigo** dark
  bar, "ADMIN" pill, nav Clinics · Subscriptions · Usage & Costs · System, Exit ↩.
- **Clinics** `clinics/page.tsx` (cross-tenant list via `admin_clinics_overview()`
  + a service-role enrich for `subscription_status`) → `clinics/[id]/page.tsx`
  (key stats, users, editable feature-flag toggles), `clinics/[id]/feature-flags.
  tsx`, `clinics/actions.ts` (`setClinicFeatureFlag` → writes `admin_audit`).
- `lib/admin/feature-flags.ts` — registry of 6 flags. **Stored + toggled but NOT
  enforced anywhere in the app** (future).
- Stubs: `subscriptions/`, `usage/`, `system/` (nav-only placeholders).
- **NO destructive actions** in this step (by spec).

---

## 3. Key decisions & gotchas (read before continuing)

1. **`credit_transactions` name collision → new ledger is `credit_ledger`.**
   Migration 015 owns `credit_transactions` with an incompatible shape
   (`amount` / `kind IN ('reserve','refund')` / `reference_id`) driving the live
   reserve/refund system. The spec's balance-change ledger is therefore named
   **`credit_ledger`**. Don't confuse the two.

2. **TWO credit models coexist — this is the #1 thing to resolve next.**
   - **OLD (live):** `clinics.monthly_credits` / `credits_used` counter +
     `reserve_credits`/`refund_credits` (015) writing `credit_transactions`. This
     STILL drives every paid path: `api/generate`, reviews insight, generate
     landing, rank scans, prospect audits.
   - **NEW (schema only):** `content_credits_balance` / `map_credits_balance` +
     `credit_ledger`. **Nothing writes or decrements these yet.** The admin panel
     shows them but they're frozen at the grandfather snapshot.
   - Next session must wire the new model in and bridge/retire the old one (§4).

3. **Admin gate = `is_super_admin`, not `platform_admins`.** An earlier unrun
   `018_platform_admin.sql` (platform_admins table) was **deleted**; 018 is now
   `018_admin_panel.sql` on `is_super_admin` (019's billing RLS already depends on
   it). Don't reintroduce `platform_admins`.

4. **clinics UPDATE column-lock (019 §6).** Blanket UPDATE was revoked from
   `authenticated` and re-granted to exactly 13 columns:
   `business_name, doctor_name, phone, address, city, area, google_review_url,
   instagram_handle, website_url, upi_id, default_lat, default_lng, booking_slug`.
   This closes the "a clinic PATCHes its own `content_credits_balance`" hole.
   **If you add a new user-editable clinic column, add it to that grant** or the
   settings/landing save will fail.

5. **Feature flags are stored, not enforced.** Toggling writes `clinics.feature_
   flags`; no code reads them to gate features yet.

6. **Verticals:** single `'dental'` default. `admin_clinics_overview()`
   intentionally references only base columns (not 019's), so it's order-safe.

---

## 4. What's NEXT (the build prompts you'll give)

Roughly prioritized:

### Wire the new credit model (biggest, do first)
- SECURITY DEFINER functions to spend/grant `content_credits_balance` /
  `map_credits_balance` atomically, each writing a `credit_ledger` row
  (`reason` = generation/map_scan/topup/admin_adjust/monthly_reset/trial_grant,
  `balance_after`, `related_id`). Mirror the 015 reserve/refund safety.
- Repoint paid paths onto it: content generation + insight + landing →
  `content_credits`; rank scans + prospect audits → `map_credits`. Decide whether
  to retire `monthly_credits`/`credits_used` + 015's `credit_transactions` or run
  a bridge. Update every place that reads `monthly_credits - credits_used`.
- `clinics.is_active` sync: trial/active/past_due → true; deactivated/cancelled →
  false (keep `subscription_status` the source of truth).

### Trial + subscription lifecycle
- On clinic onboarding: set `subscription_status='trial'`, `trial_started_at/
  ends_at`, grant trial credits (ledger `trial_grant`). Monthly reset job
  (`monthly_reset`). Transitions active/past_due/deactivated + `billing_events`.

### Admin A2 — Subscriptions page
- Set plan + credit-pack **prices** (super-admin write RLS already allows).
- Per-clinic: change plan, apply top-ups (writes balances + ledger + billing_
  events), change status. These ARE mutating admin actions → audit each.

### Admin A3 — Usage & Costs, System
- Usage: credit consumption from `credit_ledger`, provider spend.
- System: `admin_audit` **viewer** (table already super-admin readable), health,
  migration status.

### Feature-flag enforcement
- Read `clinics.feature_flags` to gate nav items + routes + actions per clinic.

### Later / external
- Billing provider integration (razorpay/cashfree/paypal) + webhooks.

---

## 5. Verification status

- ✅ `tsc --noEmit` + `next lint` clean across all five workstreams.
- ✅ **Admin 404 gate verified at runtime** (dev server, unauthenticated):
  `/admin`, `/admin/clinics`, `/admin/subscriptions` → **404**; `/dashboard` →
  307; `/` → 200. No server errors.
- ❌ **No logged-in click-through** (no session in this env). Needs a real pass:
  survey submit + notification + Mark Handled; campaign create/AI-draft/send/
  guardrail; UPI request from billing + presenter; admin panel as super-admin
  (see panel, toggle flags, audit row) AND as a normal clinic user (must 404).
  All in `TESTING.md`.

---

## 6. Carried forward from prior sessions (still open)

- ⚠️ **Two Supabase dashboard toggles** (user action, from the security session):
  enable **leaked-password protection**; **disable public email sign-ups**
  (Authentication → Providers → Email). Admin API onboarding bypasses the latter.
- **`place_id` capture** for robust Map-Rank matching (the one latent Serper risk).
- **Touch drag** on the pipeline Board (Android).
- **Rate limiter** → shared store (Upstash) for a hard cross-instance cap.
- Deferred backlog: CSV export, duplicate-patient merge, self-booking portal,
  churn-risk insights, approve/reject review layer for `/history`, enrich help KB
  past ~4,096 tokens for Haiku caching. (Bulk WhatsApp = partially done via
  Campaigns.)

---

## 7. Operational notes

- **One dev server per repo** — two `next dev` on the same `.next/` clobber each
  other. `.claude/launch.json` has a `dev` config (port 3000); use the preview
  tools, not raw `next dev`.
- **Windows / Git Bash:** quote paths containing `(app)` and `[id]`.
- **`SERP_DEBUG=1`** enables Serper request/match logs. `SERP_PROVIDER=serper`
  live in `.env.local`; `mock` is the safe default.
- Chatbot is free; generation/insight/publish/scan cost credits (old model).
- Migrations run **manually in the Supabase SQL Editor**, in order. All are
  idempotent.

---

## 8. Commit plan (suggested)

Nothing is committed. Suggested split on `growth-features-serp` (one commit each,
in dependency order), or squash per feature:

1. Post-visit survey (016 + `/s` + reviews + dashboard card).
2. Campaigns (`/campaigns` + sidebar).
3. UPI payment links (017 + settings + billing + presenter).
4. Subscriptions/credits **schema** (019) — mark clearly "schema only, not wired".
5. Admin panel foundation (018 + `/admin` + middleware + CLAUDE.md rules).

Branch is **not pushed / not merged to `main`**. Decide push vs keep-local.

### Uncommitted file map (this session)

**New migrations:** `016_post_visit_survey.sql`, `017_clinic_upi_id.sql`,
`018_admin_panel.sql`, `019_subscriptions_credits.sql`.

**New app dirs/files:** `app/s/`, `app/(app)/campaigns/`, `app/admin/`,
`app/(app)/reviews/{post-visit-actions,survey-actions,survey-row-actions}`,
`lib/admin/`, `lib/upi.ts`.

**Modified:** `.env.local.example`, `CLAUDE.md`, `TESTING.md`,
`components/{app-shell,icons}.tsx`, `lib/supabase/middleware.ts`,
`app/(app)/billing/{page,billing-actions}.tsx`, `app/(app)/dashboard/page.tsx`,
`app/(app)/patients/[id]/{page,treatment-plans}.tsx`,
`app/(app)/reviews/{page,reviews-tabs}.tsx`,
`app/(app)/settings/{actions,clinic-info-form,page}.tsx`.
