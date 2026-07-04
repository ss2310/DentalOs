# HANDOFF — GrowthOS

Read `CLAUDE.md` first (permanent rules), then this, then `TESTING.md` (manual
checklists per feature).

Last updated: **end of the subscriptions + lifecycle + super-admin session**.
Branch: **`growth-features-serp`** (not pushed, not merged to `main`).

---

## 0. TL;DR — what this arc shipped

The whole **billing / subscription / admin** layer, on top of the earlier
schema (019). All `tsc --noEmit` + `next lint` clean; dev server boots; admin
routes 404 correctly when unauthenticated.

1. **Credit engine (020)** — atomic spend/refund/grant over
   `content_credits_balance` / `map_credits_balance` + `credit_ledger`.
2. **Trial init on signup** + **all paid paths rewired** onto the balance model.
3. **Access gating** (deactivated→/upgrade, expired-trial→past_due banner) +
   **/upgrade** page + **Settings→Billing** tab + **manual checkout** provider.
4. **Lifecycle automation (021)** — daily pg_cron `run_subscription_lifecycle()`
   (trial reminders → past_due → deactivated) + admin dunning list.
5. **Super-admin dashboard (022)** — overview, rich clinics table, clinic detail
   with audited admin actions (activate / grant / extend / change plan /
   deactivate-reactivate).

---

## 1. ⚠️ CRITICAL — migration + commit state

**Migrations are applied MANUALLY in the Supabase SQL editor, in order, idempotent.**

| # | File | Applied? | Notes |
|---|---|---|---|
| 014 | `014_profile_escalation_lockdown.sql` | ❌ **NOT applied** | **BREAKS NEW SIGNUPS** — see §2. |
| 016–019 | survey / upi / admin / subs schema | ✅ | |
| 020 | `020_credit_engine.sql` | ✅ | credit engine |
| 021 | `021_subscription_lifecycle.sql` | ✅ | pg_cron lifecycle |
| 022 | `022_admin_dashboard.sql` | ❓ **verify** | admin functions — apply if not done |

**Commits on `growth-features-serp`:**
- `0f6de2f` — subscriptions & credit engine + prior branch bundle
- `25ca3c3` — trial/subscription lifecycle automation (021)
- **UNCOMMITTED:** the entire **super-admin dashboard** (022 + `/admin` overview,
  clinics table, clinic detail + actions, sidebar link). Commit when ready.

---

## 2. ⚠️ TWO OPEN BUGS (do these first)

1. **Migration 014 is not applied → every new signup becomes a `receptionist`
   with `home_clinic_id = null`**, so they see none of the `adminOnly` nav
   (Marketing/Settings). The app already passes role via `app_metadata`, but the
   live `handle_new_user` trigger still reads `user_metadata`. **Fix: run
   `014_profile_escalation_lockdown.sql`.** (Verified by test: an app_metadata-only
   user comes out `receptionist`.)
2. **One already-broken account** — clinic `Dr. Mahima's Dental Care`
   (`f3fdaf45-1b8b-4315-b4ff-e4c49c89b0bd`), owner profile
   `41fad936-a65a-4042-a0c3-ac1981ac819b` — needs a one-line repair:
   ```sql
   update profiles set role='clinic_owner',
     home_clinic_id='f3fdaf45-1b8b-4315-b4ff-e4c49c89b0bd'
   where id='41fad936-a65a-4042-a0c3-ac1981ac819b';
   ```

Super-admin account for testing: **dashingdude2310@gmail.com** (`is_super_admin=true`).
Reach the panel at the **absolute** URL `/admin` (a relative `admin` from
`/dashboard` 404s — now also fixed by the sidebar link).

---

## 3. Key architecture / gotchas

- **Ledger naming:** the balance-model ledger is **`credit_ledger`** (019/020).
  015's `credit_transactions` (reserve/refund) is a DIFFERENT, older table, left
  untouched. Prompts often say "credit_transactions" meaning the new ledger.
- **Credit spend** (`lib/credits.ts` → `spend_credits` RPC): atomic, clinic
  derived server-side from `current_clinic_id()` (never a client-passed id).
  Spend-before + refund-on-failure. Content paths → `content` credits; rank scan
  + prospect audit → `map` credits (1 per scan, in addition to the 015 SERP cap).
- **Admin security model:** `is_super_admin` checked server-side on every request
  (`lib/admin/auth.ts`: `requireSuperAdmin`/`requireAdminContext`), middleware
  404s `/admin` + `/api/admin` for non-admins, service-role client handed out
  ONLY after re-check, all cross-tenant writes go through **service-role-only
  SECURITY DEFINER `admin_*` functions** (022) that each write `billing_events`
  with `actor`, plus a `writeAudit()` → `admin_audit` row. Normal clinic RLS is
  never loosened. Admin accent is **indigo** (`#4F46E5`), not teal.
- **Lifecycle (021):** pg_cron SQL (NOT an Edge Function), `45 1 * * *` UTC =
  7:15 AM IST. Tunables (reminder offsets `[7,2,0]`, `GRACE_DAYS=3`) are
  constants atop `run_subscription_lifecycle()`. WhatsApp can't be sent from
  cron → owner outreach is one-tap `wa.me` links in the admin dunning list.
- **MRR** = Σ active clinics' plan `price_inr`. Plans seed at **₹0**, so MRR reads
  ₹0 until prices are set (see §4). All the math is already correct.
- **Windows/Git Bash:** quote paths with `(app)` and `[id]`. One dev server per
  repo (shared `.next`). Preview server: use `.claude/launch.json` `dev`.

---

## 4. What's NEXT (suggested)

- **Run migration 014 + repair the broken profile** (§2). Highest priority.
- **Commit** the super-admin dashboard; verify 022 is applied.
- **Admin: set plan + pack prices** (the `plans`/`credit_packs` catalogs; RLS
  already allows super-admin writes) — unblocks real MRR + checkout amounts.
- **Billing provider integration** (razorpay/cashfree) — adapters stub-ready in
  `lib/billing/`; wire `startCheckout` redirect + a webhook that calls
  `confirm_billing_event`. Then flip a clinic's `billing_provider`.
- **Email**: Resend seams are marked per stage in `run_subscription_lifecycle()`
  and could also attach to the admin actions. Currently WhatsApp + in-app only.
- **Feature flags** are stored (`clinics.feature_flags`) but NOT enforced anywhere.
- Carried-forward infra: leaked-password protection + disable public email
  sign-ups (Supabase Auth toggles); `place_id` capture for Map-Rank; touch-drag
  on the pipeline board; shared-store rate limiter (Upstash).

---

## 5. Verification status

- ✅ `tsc --noEmit` + `next lint` clean across the whole arc.
- ✅ Admin routes 404 unauthenticated (middleware gate); all routes compile.
- ❌ **No logged-in click-through of the admin actions** in this env — needs a
  real super-admin pass once 022 is applied. `TESTING.md` has the security-first
  checklist (deny cases before happy paths) for every admin action + lifecycle
  transition + credit path.

---

## 6. File map (this arc, by area)

- **Credits/subs:** `lib/credits.ts`, `lib/subscription.ts`,
  `lib/subscription-messages.ts`, `lib/billing/*`, `app/(app)/upgrade/*`,
  `app/(app)/settings/billing-tab.tsx`, migrations `020`/`021`/`022`.
- **Admin:** `lib/admin/*`, `app/admin/*` (overview `page.tsx`, `admin-nav.tsx`,
  `clinics/{page,clinics-table}.tsx`, `clinics/[id]/{page,admin-actions}.tsx`,
  `clinics/actions.ts`, `subscriptions/*`).
- **Shared/gating:** `lib/supabase/middleware.ts`, `app/(app)/layout.tsx`,
  `components/app-shell.tsx` (Upgrade + past_due banner + super-admin Admin link),
  `components/icons.tsx`, `app/signup/*`.
- Paid-path rewires: `app/api/generate/route.ts`,
  `app/(app)/generate/landing-actions.ts`, `app/(app)/campaigns/actions.ts`,
  `app/(app)/reviews/actions.ts`, `app/(app)/rank/*`, `app/(app)/prospect/actions.ts`.
