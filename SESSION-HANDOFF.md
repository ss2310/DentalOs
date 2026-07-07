# SESSION HANDOFF — Vertical expansion, audit vertical-awareness, signup fixes

Date: 2026-07-04 · Branch: `vertical-config`

Read `CLAUDE.md` first (esp. **Vertical expansion rules** and **Multi-tenancy**).
This doc covers everything done in this session and what's still open.

---

## 0. TL;DR

Built on top of the existing multi-vertical foundation (`clinics.vertical`,
`verticals` table, `lib/vertical.mjs` → `resolveForVertical`, flag
`ENABLE_MULTI_VERTICAL`). This session:

1. **Seeded 3 non-dental verticals** — dermatology (`derma`), orthopedics
   (`ortho`), physiotherapy (`physio`): 122 topic rows each + authored compliance
   rules & few-shots in the seed files.
2. **Made the audit / AI-visibility / map-scan / competitor layer vertical-aware**
   (per-vertical query bank + grid keyword + competitor keyword, dental fallback).
3. **Made starter rate cards vertical-aware** and neutralized dental placeholder
   text across the practice-management forms.
4. **Fixed two production bugs**: new-clinic owner getting `receptionist`, and no
   phone-uniqueness on signup.
5. **Fixed a global modal bug** (heading clipped off-screen).

All committed on `vertical-config`. Migrations 028 + 029 already applied by the
user in the Supabase SQL editor.

---

## 1. ⚠️ Environment / DB state right now

- **`ENABLE_MULTI_VERTICAL=true`** in `.env.local` (local dev). Keep it OFF in prod
  until a paying non-dental clinic exists (CLAUDE.md rule).
- **All 4 verticals are `is_active=true`** in the working DB — I flipped
  derma/ortho/physio on so the niche dropdowns show them for testing. They were
  seeded inactive; toggle in `/admin/verticals` or flip back if needed.
- **Migrations applied:** 028 (`prospect_audits.vertical`), 029
  (`clinics.phone` unique index). Everything ≤027 was already applied.
- **Migration runners:** DDL must be run **by hand in the Supabase SQL editor** —
  the service role (PostgREST) cannot run DDL. Down-scripts live in
  `supabase/rollback/`, NOT in `supabase/migrations/`.
- **Dev server:** run on port 3000 via the preview tooling (`.claude/launch.json`
  has a `dev` config). Reuses/restarts fine.
- **Real clinics in DB:** `Mayur Derma` (vertical=derma, owner Mayur Malpani),
  `ABCD` (dental, 17 patients — the main test clinic, owner Dr. Utsav + a
  receptionist), plus a few empty dental test clinics (`abc`, `Test Dental
  Clinic`). "OrthoLife Clinic" / test physio clinics are NOT real rows — they were
  only in-memory test-harness identities.

---

## 2. The vertical pattern (follow this for new features)

Two mechanisms, use the right one:

- **DB catalog rows** (post_types, topic_suggestions): tag rows with a nullable
  `vertical` (NULL = all verticals) and resolve with `resolveForVertical` from
  `lib/vertical.mjs`. Adding a niche = adding rows via the seed job.
- **Code-level per-vertical defaults** (query templates, grid keyword, starter
  rate cards): a `Record<vertical, T>` map with a `resolve…(vertical)` helper that
  falls back to `DEFAULT_VERTICAL` ('dental'). Dental values are byte-identical to
  the old hardcoded ones. **No `if (vertical === 'derma')` branches in feature
  code** — it's always a keyed lookup + fallback.

Established code banks (copy this shape for new vertical-varying config):
- `lib/vertical-search.ts` — AI-visibility query templates, grid keyword,
  competitor keyword, sample query. `resolveVerticalSearch(vertical)`.
- `lib/starter-rate-cards.ts` — per-vertical starter treatment catalog.
  `resolveStarterRateCards(vertical)`.

Seed jobs: `seeds/verticals/<slug>.ts` + `npm run seed:vertical -- <slug>`
(idempotent: replaces only that vertical's curated topic rows). The loader also
seeds a `gbp_category` bank (primary/secondary GBP categories).

---

## 3. File map (what changed / where things live)

### Vertical content seeds (committed)
- `seeds/verticals/derma.ts`, `ortho.ts`, `physio.ts` — 122 topics each across
  banks: social · article · service · guide · comparison · question · occasion ·
  update · gbp_category. Plus authored `compliance_rules` + `few_shots` arrays.
- `scripts/seed-vertical.mjs` — the loader. Made idempotent (delete-then-insert
  scoped to `vertical=slug`) and fixed a Windows import-path bug.

### Audit / AI-visibility / map-scan vertical-awareness (committed; migration 028)
- `lib/vertical-search.ts` — **the per-vertical bank** (queries + keywords).
- `lib/ai-visibility.ts` — `buildQueryTemplates(clinic, vertical?)` now pulls from
  the bank. Dental output byte-identical.
- `lib/serp/mock.ts` — mock competitor names now keyword-derived (so a non-dental
  scan shows vertical-native sample competitors; dental default unchanged).
- `app/(app)/ai-visibility/{actions.ts,page.tsx,query-manager.tsx}` — thread
  `clinic.vertical`; vertical-aware "add query" placeholder.
- `app/(app)/rank/{page.tsx,rank-toolbar.tsx}` — per-vertical default grid keyword
  (prefilled, editable).
- `app/(app)/prospect/{page.tsx,new-audit.tsx,actions.ts,[id]/ai-visibility/page.tsx}`
  — flag-gated agency vertical picker; `prospect_audits.vertical` (migration 028)
  read defensively + written best-effort.
- `supabase/migrations/028_prospect_audit_vertical.sql` (+ rollback).

### Starter rate cards + placeholder sweep (committed)
- `lib/starter-rate-cards.ts` — per-vertical starter treatments (prices are
  editable ₹ defaults).
- `app/signup/actions.ts` — seeds `resolveStarterRateCards(vertical)`.
- Neutralized dental placeholder text in: `app/signup/signup-form.tsx`,
  `app/(app)/leads/leads-toolbar.tsx`,
  `app/(app)/patients/[id]/treatment-plans.tsx`,
  `app/(app)/settings/rate-card-manager.tsx`,
  `app/(app)/generate/publish-hosted-page.tsx`.

### Signup role + phone integrity (committed; migration 029)
- `app/signup/actions.ts` — after `createUser`, the owner's
  `role='clinic_owner'` + `home_clinic_id` are set **explicitly via the service
  role** (upsert on `profiles`), instead of relying on the `handle_new_user`
  trigger reading `app_metadata` at insert time (GoTrue can persist app_metadata
  AFTER the insert, intermittently making the owner a `receptionist` with no
  clinic). Rolls back a half-created account on failure. Also rejects a signup
  whose phone already exists.
- `supabase/migrations/029_clinic_phone_unique.sql` — partial unique index on
  `clinics.phone`.

### Modal fix (committed)
- `components/modal.tsx` — portal to `document.body` (was rendered inside the
  header's `backdrop-blur`, whose `backdrop-filter` made it the containing block
  for the `fixed` overlay → modal anchored to the 64px header, heading clipped
  off-screen). Also fixed an invalid `calc()` that dropped the desktop height cap.

---

## 4. Git log (this session, newest first)

```
943d08b Vertical-aware starter rate cards + neutralize dental placeholders
bb518b5 Signup: deterministic owner role + phone uniqueness
14baa91 Make audit / AI-visibility / map-scan layer vertical-aware
2a606fe Fix modal heading clipped off-screen (portal to body)
6085133 Seed physiotherapy vertical (physio)
73ff040 Seed orthopedics vertical (ortho)          [earlier]
ecf38dd Seed dermatology vertical (derma) + idempotent seed loader   [earlier]
```

Working tree clean.

---

## 5. ⚠️ Biggest open gap — compliance rules & few-shots are AUTHORED, not ENFORCED

The per-vertical **compliance rules** and **few-shot examples** are written into
`seeds/verticals/*.ts`, but:
- **No store tables exist** (`compliance_rules`, `few_shot_examples`) — the seed
  loader reports them as "pending / skipped", writes nothing.
- **They are NOT injected into the content-generation prompt.**
  `app/api/generate/route.ts` still uses the dental-worded `SHARED_SYSTEM_PROMPT`
  + a single `{{vertical_directive}}` line ("You write for a <Display> clinic.").

Consequence (demonstrated live in this session): a physio Instagram caption
emitted specific home-exercise reps without a "get assessed first" gate — the
model's judgment, not enforcement. **To make guardrails bind you need:** two store
tables + a migration, seed the authored rules/few-shots (loader already has the
data), and a `route.ts` change that resolves them by vertical (via
`resolveForVertical`) and injects them into the system prompt + few-shot messages.
This is the highest-value next task for the vertical system.

---

## 6. Other open / pending items

- **Bug: "create plan → could add only one treatment"** — NOT reproduced from
  code (the modal supports many rows; derma clinic now has 10 rate cards). Believed
  fixed by the modal portal fix (`2a606fe`). **Needs a user re-test on Mayur Derma**
  (open a patient → Create Plan → "+ Add treatment"). If it still repros, get the
  exact screen/screenshot.
- **Agency-mode prospect vertical** — the vertical picker in New Audit is
  flag-gated and persists via `prospect_audits.vertical` (028, applied). The
  public audit report / competitor discovery are keyword-driven, so they follow
  whatever keyword the agency enters. No dedicated agency vertical UI beyond the
  picker.
- **`topic_suggestions` curated unique index is `(bank,label)` where
  `clinic_id is null`, NOT vertical-aware.** New verticals must use labels
  distinct from dental/other verticals within a bank (I did). If a future vertical
  needs to reuse a label, widen the index to include `vertical` (small migration).
- **Starter rate-card prices** are reasonable ₹ defaults, not researched — clinics
  edit them in Settings.
- **6-MOAT audit scoring weights** are intentionally unchanged across verticals.

---

## 7. How to test / verify (patterns used)

- **Unit/parity:** `npm test` (17 tests) + `npx tsc --noEmit` + `npx next lint`.
- **Node harness for app TS modules** (they use the `@/` alias + extensionless
  relative imports, which plain Node can't resolve): register a resolve hook that
  maps `@/…` to project root and appends `.ts`/`.mjs`, run with
  `node --import ./scripts/_register.mjs script.mjs`. Used this to run the real
  audit functions for derma/ortho and prove no dental leaks. (Temp harness files
  were removed after use — recreate as needed.)
- **DB inspection / one-off data fixes:** a throwaway `scripts/_tmp-*.mjs` that
  parses `.env.local` and uses `@supabase/supabase-js` with the service role. Must
  live under `scripts/` (project root) so it resolves `node_modules`. Delete after.
- **Browser preview:** auth-gated pages need a logged-in session; the public
  `/signup` bounces logged-in users to the dashboard.

---

## 8. Data repairs already done (don't redo)

- `Mayur Malpani` profile fixed to `clinic_owner` + linked to `Mayur Derma`.
- `Surana Dental Clinic` deleted (was a phone dup of Mayur Derma).
- `abc` + `Test Dental Clinic` had their `phone` blanked (kept `ABCD` on
  `9926527675`) so the 029 unique index could apply.
- `Mayur Derma` rate cards swapped from dental → derma starters.
