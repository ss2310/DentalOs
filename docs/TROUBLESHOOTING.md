# GrowthOS — Technical Troubleshooting Guide

For a developer diagnosing issues in the code. Read `CLAUDE.md` first — it
holds the non-negotiable rules (tenancy, design system, WhatsApp, admin).
This doc maps symptoms → subsystems → the exact files to open.

## Architecture in 90 seconds

- **Next.js 14 App Router.** Pages in `app/(app)/…` (clinic app, session
  auth), `app/admin/…` (platform owner, indigo, super-admin gated),
  `app/api/…` (route handlers). Server components by default; `"use client"`
  only where interaction demands.
- **Supabase** is the backend: Postgres with **RLS on every table** (the
  session client in `lib/supabase/server.ts` is tenant-scoped
  automatically via `current_clinic_id()`); the service-role client
  (`lib/supabase/admin.ts`, `import "server-only"`) **bypasses RLS** and may
  only be used inside admin-verified handlers or crons.
- **Migrations** (`supabase/migrations/001…043`) are applied MANUALLY in the
  Supabase SQL editor, in order, then `notify pgrst, 'reload schema';`.
  `applied_migrations` records what ran. There is no migration runner.
- **Money paths**: credits via the atomic `spend_credits` RPC
  (`lib/credits.ts` — spend BEFORE the paid call, refund on failure);
  subscriptions/packs via Cashfree webhooks → `apply_plan_purchase` /
  `apply_pack_purchase` (migration 040).
- **Pure logic lives in dependency-free `.mjs`** (`lib/vertical.mjs`,
  `lib/social/*.mjs`, `lib/capture/consent.mjs`, `lib/audit/*.mjs`) tested by
  `npm test` (node --test, `scripts/test-*.mjs`). If you change behavior,
  change the test.

## First moves on ANY bug

```bash
npm test              # 99 unit tests — pure logic regressions show here
npx tsc --noEmit      # type drift
```
Then: Vercel function logs (every server catch does `console.error` with a
prefix you can grep in this repo) and Supabase logs (RLS denials show as
empty results, storage denials as 403s).

## Symptom → where to look

### "User sees no data / data missing" (but it exists in the DB)
Almost always RLS. The session client only returns rows where
`clinic_id = current_clinic_id()`. Check: (1) does the user's
`profiles.home_clinic_id` match the row's `clinic_id`? (2) did a new table
ship without a policy? (3) a `.single()` throwing on 0 rows swallowed
upstream? RLS policies live in each migration next to the table.

### "Generation failed / credits vanished"
`app/api/generate/route.ts` (Content Studio) and
`app/api/generate/social/route.ts` (Social). Flow: role gate → quota →
`spendCredits` → Claude call → on ANY failure `refundCredit(ledgerId)`.
If credits were charged with no output, look for a thrown error AFTER the
spend and BEFORE the refund — the `credit_ledger` table shows the spend and
the refund rows per clinic. `ANTHROPIC_API_KEY` unset returns "AI is not
configured"; 429s surface as "AI is busy".

### "Social post blocked / flagged wrongly"
The deterministic YMYL validator: `lib/social/ymyl.mjs` (+ tests in
`scripts/test-social-ymyl.mjs`). A number/₹/percentage is only allowed if its
digit-run appears in an allowed fact (topic, context, verified proof points).
False positive? Reproduce in the test file first. Banned phrases come from
three layers: `GLOBAL_BANNED_PHRASES` + `compliance_rules` rows (vertical
catalog) + the clinic's voice profile.

### "Image render fails"
`lib/social/render.ts` (+ `lib/capture/compose.ts` for patient photos) on
satori + `@resvg/resvg-js`. Known constraints: resvg is a native binary and
MUST stay in `serverComponentsExternalPackages` (next.config.mjs) or the
build breaks with "Module parse failed: Unexpected character"; fonts are TTFs
read from `assets/fonts/` via `process.cwd()` (missing = ENOENT at render);
emoji are stripped from image text on purpose (Inter has no emoji glyphs);
logos must be PNG/JPEG (webp/svg logos are skipped by design).

### "Social/queue status won't move"
ONE transition map: `lib/social/status.mjs`. Every server action calls
`assertTransition` and does an optimistic-lock update
(`.eq("status", current)`). "The post changed under you" = two staff moving
the same post; refresh. Anything else = someone bypassed the actions.

### "Moment Capture: photo/consent issues"
Consent rules are DB-enforced: `capture_moments` CHECKs reject a row with no
consent or a mismatched `consent_type` (migration 043). The social/composer
paths all filter `.eq("consent_type", "review_and_social")` — a review-only
moment 404ing from `/capture/[id]/compose` is CORRECT behavior. The 30-day
review-ask cap spans three tables — logic in `lib/capture/consent.mjs`
(`reviewAskAllowed`), inputs gathered in `app/(app)/capture/actions.ts`
(`priorReviewAsks`).

### "Deep Audit stuck / failed mid-run"
The audit is a 6-stage state machine: `lib/audit/run.ts` (stage list),
stages in `lib/audit/stages/*`. A run's `status`/`stage_cursor`/`error` on
`audit_runs` tells you where it died. Manual runs are driven by the browser
poller; auto runs by `/api/cron/deep-audit-runner` (one stage per tick).
Failures at discovery auto-refund the audit credit
(`release_deep_audit_run`). Per-engine failures in stage 4 are stored as
`status='error'` cells — they exclude themselves from scoring rather than
poisoning it. Cost telemetry: `audit_runs.est_api_cost_inr`.

### "Cron didn't run / 401"
Three crons (`vercel.json`): deep-audit (daily), deep-audit-runner (*/2 —
requires Vercel Pro), purge-voice-audio (daily). All expect
`Authorization: Bearer $CRON_SECRET`; Vercel injects it automatically when
the env var exists. Test locally:
`curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/deep-audit`.
Middleware exempts `/api/cron/` from session auth.

### "WhatsApp message is wrong / didn't send"
GrowthOS NEVER sends — it opens `wa.me` links (`lib/whatsapp.ts`; phone
normalization in `lib/validation.ts`, +91 rules). "Didn't send" usually
means: popup blocked (buttons must call `window.open` synchronously inside
the click — see the existing patterns before changing one), or a bad stored
phone. Every send stamps a `*_sent_at` column → the ✓ Sent label; that stamp
is also the anti-duplicate guard.

### "Payment made but credits/plan not granted"
`app/api/webhooks/cashfree/` → `apply_plan_purchase`/`apply_pack_purchase`
(SECURITY DEFINER, service-role only). Check `billing_events` /
`pending_payments` for the webhook record; replaying the RPC manually with
the service role is safe (idempotent grant semantics — but check
`last_payment_at` first).

### "Admin panel visible to a clinic user" (should be impossible)
`middleware.ts` gates `/admin` + every page re-verifies via
`requireAdminContext()` (`lib/admin/auth.ts`). Non-admins must get **404,
never 403**. If anything else happens, treat as a security incident.

### "Vertical content wrong / missing"
ONE resolver: `resolveForVertical` in `lib/vertical.mjs` (prefer the
clinic's vertical row, else the shared NULL row, never another vertical's).
Catalog tables: `post_types`, `topic_suggestions`, `compliance_rules`,
`few_shot_examples`. Dental content is stored as NULL (shared pool) — do NOT
tag it 'dental'. Seeding: `npm run seed:vertical -- <slug>`.

### Local dev gotchas
- Never run `next build` while `next dev` is running (shared `.next/`).
- Windows: `node --conditions=react-server script.ts` lets you import
  `server-only` libs in a standalone script (used by past render spikes).
- `.env.local` mirrors the production env list in `docs/DEPLOYMENT.md`;
  `SERP_PROVIDER=mock` avoids metered SERP calls in dev.
- Stale `.next/types` errors after deleting a route: delete the matching
  folder under `.next/types` (or wipe `.next/`).

## Where the bodies are buried (honest notes)

- `TESTING.md` is the manual regression suite — append to it per feature.
- Deep Audit summary revenue math intentionally returns null (formulas
  pending) — the report shows "unlocking soon", that's not a bug.
- `lib/plans.ts` (coarse free/starter/pro/agency caps for landing pages) and
  the `plans` TABLE (billing) are two separate systems — don't unify them
  casually.
- `mint`/`ink` Tailwind tokens are legacy; teal `primary` is the only accent
  (see CLAUDE.md design rules before touching UI).
- The `/api/dev/*` routes and `scripts/inspect-run.mjs` are dev-only harnesses
  (404 in production) — delete before deploy; they exist to drive audits and
  social E2E without a browser session.
