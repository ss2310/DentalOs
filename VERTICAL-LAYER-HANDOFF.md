# HANDOFF — Multi-Vertical Layer

Built on branch `vertical-config`. Goal: let GrowthOS serve non-dental clinics
(derma, ortho, physio, …) **without changing anything for dental**, which stays
byte-for-byte identical. Read `CLAUDE.md` § "Vertical expansion rules" for the
permanent rule: **new verticals are seed-data jobs, never code forks.**

---

## 0. TL;DR

Two halves, both shipped:

1. **Data + resolution (always on).** A `verticals` catalog, a `vertical` column
   on `clinics` (default `'dental'`) and on the content catalogs (`post_types`,
   `topic_suggestions`, nullable = "applies to all"). One shared function,
   `resolveForVertical`, decides which rows a clinic sees: **its own vertical →
   else the shared NULL rows → never another vertical's.** Today every catalog
   row is NULL and every clinic is dental, so dental output is unchanged.
2. **UI (flag-gated, `ENABLE_MULTI_VERTICAL`, default OFF).** When on: a Vertical
   dropdown in Settings + signup, and an admin `/admin/verticals` page to
   activate verticals and see content coverage. When off: none of it exists.

---

## 1. ⚠️ Turn it on (manual steps)

1. **Apply migrations** in the Supabase SQL Editor, in order:
   - `026_multi_vertical.sql` — verticals table (seeds only `dental`),
     `clinics.vertical`, nullable `vertical` on the catalogs. **Applied ✅** in
     the working DB (verticals has the `dental` row).
   - `027_clinic_vertical_setter.sql` — `set_clinic_vertical` definer fn (the
     Settings picker needs it). **NOT applied yet — run this.**
   - ⚠️ Migration runners: the matching **down** scripts live in
     `supabase/rollback/`, NOT in `supabase/migrations/`, on purpose — a
     `…down.sql` in migrations/ sorts before the up and would run first. Apply
     only the files in `supabase/migrations/`.
2. **Env** (`.env.local`): `ENABLE_MULTI_VERTICAL` — leave unset / `false` in
   production. Set to `true` only when a paying non-dental clinic exists.

---

## 2. Where things live (file map)

- **Resolver (the one rule):** `lib/vertical.mjs` (`resolveForVertical`,
  `verticalDirective`, `DEFAULT_VERTICAL`) + `.d.ts`. Pure, unit-tested.
- **Flag:** `lib/multi-vertical-flag.mjs` (pure parser) + `.d.ts`;
  `lib/multi-vertical-access.ts` (`server-only` wrapper — `multiVerticalEnabled()`).
- **Migrations:** `supabase/migrations/026_multi_vertical.sql`,
  `027_clinic_vertical_setter.sql`. Rollbacks: `supabase/rollback/026…down.sql`,
  `027…down.sql`.
- **Content generation (uses the resolver):**
  `app/api/generate/route.ts` (guards the chosen post type by vertical; adds the
  `{{vertical_directive}}` line — empty for dental), `app/(app)/generate/page.tsx`
  (post-type grid + topic dropdowns resolved by vertical). `lib/generate.ts`
  (`PostType.vertical`). All degrade gracefully if the `vertical` column is
  absent.
- **Settings picker (flag-gated):** `app/(app)/settings/vertical-selector.tsx`,
  `setClinicVertical` in `app/(app)/settings/actions.ts` (→ `set_clinic_vertical`
  RPC), wired through `settings-tabs.tsx` + `settings/page.tsx`.
- **Onboarding picker (flag-gated):** `app/signup/page.tsx` (fetches active
  verticals via service role when the flag is on), `signup-form.tsx` (dropdown),
  `signup/actions.ts` (sets `vertical` only when flag on + slug is active; else
  DB default).
- **Admin:** `app/admin/verticals/{page,actions,verticals-table}.tsx` (list,
  toggle `is_active` via service role + `writeAudit`, per-vertical coverage);
  `admin-nav.tsx` + `admin/layout.tsx` (flag-gated "Verticals" nav link).
- **Seed scaffolding:** `seeds/verticals/derma.ts` (empty template), loader
  `scripts/seed-vertical.mjs` (`npm run seed:vertical -- <slug>`).
- **Proofs/tests:** `scripts/test-vertical-parity.mjs`,
  `scripts/prove-vertical-parity.mjs` (live read-only before/after),
  `scripts/test-multi-vertical-flag.mjs`, `scripts/show-multi-vertical.mjs`
  (OFF vs ON gate map). `npm test` runs the unit suites.
- **Docs:** `CLAUDE.md` § Vertical expansion rules; `TESTING.md` two new sections.

---

## 3. The fallback design, in one paragraph

Every catalog row carries a `vertical` tag, or **NULL = applies to every
vertical**. For a clinic, `resolveForVertical` keeps a row only if its tag equals
the clinic's vertical or is NULL, and when a vertical-specific row and a shared
NULL row compete for the same logical slot (post-type name, or bank+label), the
specific one wins. Because dental content is stored as **NULL** (the shared pool)
and every clinic is `dental` today, the resolver returns every row unchanged, in
order — identical to pre-migration. The feature only "activates" when someone
tags rows for a new vertical, which the seed job does.

## 4. How to onboard a new vertical later (no code)

1. Add the row: `insert into verticals (id, display_name, is_active) values
   ('derma','Dermatology',false);` (or via `/admin/verticals`).
2. `cp seeds/verticals/derma.ts seeds/verticals/<slug>.ts`, fill the topic /
   few-shot / compliance arrays.
3. `npm run seed:vertical -- <slug>` (writes topic_suggestions tagged with the
   vertical; few-shots/compliance are reported as pending — no store table yet).
4. Watch coverage in `/admin/verticals`; flip `is_active` on when ready.
5. Flip `ENABLE_MULTI_VERTICAL=true` once a paying non-dental clinic exists.

## 5. Verification status

- `tsc --noEmit`, `next lint`, `npm test` (17 tests) all green.
- Live read-only proof against the real dental clinic ("Smile Dental Care"):
  post types, topic dropdowns, and the assembled system prompt are byte-identical
  pre/post migration (`node scripts/prove-vertical-parity.mjs`).
- Flag OFF verified live on `/signup` (no vertical dropdown, HTTP 200). OFF/ON
  gate map via `node scripts/show-multi-vertical.mjs`.
- **Not done in the build env:** applying migration 027; an authenticated
  click-through of the Settings/admin dropdowns with the flag ON (needs a server
  restart with `ENABLE_MULTI_VERTICAL=true` + a logged-in session).

## 6. Open items / notes

- **No `compliance_rules` or few-shot tables exist.** Compliance lives in the
  shared prompt + `post_types.prompt_template`. The seed template has slots for
  both; the loader reports them as pending until those tables + migrations exist.
- **`topic_suggestions` curated uniqueness is `(bank,label)` where `clinic_id is
  null` — NOT vertical-aware.** If a future vertical reuses a dental bank+label,
  widen that index to include `vertical` first (a small migration).
- **`clinics.vertical` is column-locked** (migration 019). Onboarding sets it via
  the service role; Settings sets it via the `set_clinic_vertical` definer. Never
  add `vertical` to the authenticated column grant.
- This branch snapshot also contains earlier uncommitted work (voice-notes
  surface, admin dashboard) — see `VOICE-NOTES-HANDOFF.md`.
