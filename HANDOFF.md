# HANDOFF — GrowthOS

Read `CLAUDE.md` first (permanent rules), then this, then `TESTING.md` (manual
checklists per feature) and `SECURITY-AND-REDESIGN-HANDOFF.md` (the full security
audit that this session worked through).

Last updated: **04 Jul 2026**. Branch: **`growth-features-serp`** (not pushed, not
merged to `main`). Working tree is **clean — everything below is committed.**

> **Top of mind next session:** two Supabase **dashboard** toggles for the SEC-016
> batch are still the user's to flip (leaked-password protection + disable public
> email signup — see §4). And the **`place_id` hardening** for Map-Rank matching
> was diagnosed + offered but not built (§6). Everything else is landed.

---

## 0. TL;DR — what this session shipped

All committed, `tsc --noEmit` + `next lint` clean, boots clean. Branch not pushed.
The theme was **closing the security audit** (migrations 014 + 015 + an app-only
hardening batch), then two features and a Serper debugging pass.

**Migrations 014 and 015 have been APPLIED by the user** to the database.

---

## 1. Commit map (this session, newest first)

| Commit | What |
|---|---|
| `db79d37` | Serper **match** debug instrumentation (SERP_DEBUG) — no logic change |
| `454045a` | Serper **request** debug instrumentation (SERP_DEBUG) — no logic change |
| `bd71627` | **Clinic location set once** in Settings; drop per-keyword coordinates |
| `791b851` | Fix swallowed **"Could not start the scan"** error |
| `9714016` | **Pipeline List / Board** view toggle (Kanban + drag-and-drop) |
| `0d1de63` | **Security 016** — input & boundary hardening (app-only) |
| `4dd8248` | **Security 015** — atomic credit + SERP reservations (TOCTOU fix) |
| `9b5a38d` | **Security 014** — profile privilege-escalation lockdown |

(Everything at `09c8e96` and earlier = prior sessions.)

---

## 2. Migration 014 — profile privilege-escalation lockdown  ✅ APPLIED

File `supabase/migrations/014_profile_escalation_lockdown.sql`. Fixes:
- **SEC-C1** — `profiles` had table-level UPDATE for `authenticated`, so a user
  could self-promote (`role`) or jump clinics (`home_clinic_id`). Now: `REVOKE
  UPDATE` + a **column-scoped grant** of only `full_name`,
  `unread_notification_count`. Security columns can't be written by the client.
- **SEC-C2** — `handle_new_user` now reads `role`/`home_clinic_id` **only from
  `raw_app_meta_data`** (service-role-only), never `raw_user_meta_data`. Paired
  app change: `signup/actions.ts` + `settings/staff-actions.ts` pass those via
  `app_metadata` instead of `user_metadata`. (Ship-together coupling — done.)
- **SEC-L4** — `notifications_insert` now also requires `target_user_id` to be
  in the same clinic.

`is_super_admin` does **not** exist in this schema (only `is_agency`, migration
007) — it was in the audit prose but there's no such column.

---

## 3. Migration 015 — atomic credit + SERP reservations  ✅ APPLIED

File `supabase/migrations/015_atomic_reservations.sql`. Replaces every
"read → check → paid call → write" TOCTOU race with **reserve-before-call +
refund-on-failure** (mirrors the existing `record_payment` pattern).

- **`reserve_credits` / `refund_credits`** (SEC-H1, SEC-L1). Credits are a
  counter model (`clinics.credits_used` vs `monthly_credits`), NOT a balance —
  the atomic guard is `UPDATE … WHERE credits_used + cost <= monthly_credits`.
  New **`credit_transactions`** ledger (RLS read-only; written only by the RPCs).
  **Refund is tied to a per-op `reference_id` + `kind`** so it can't be replayed
  to mint free credits. App wiring: `api/generate/route.ts`,
  `reviews/actions.ts`, `generate/landing-actions.ts`.
- **`reserve_rank_scan` / `reserve_prospect_audit`** (SEC-M1). SERP cap is a
  monthly **row count**, so these use a per-clinic/user `pg_advisory_xact_lock` +
  count + insert a `'reserved'` row up front; total failure deletes it. `status`
  column added to `rank_scans` / `prospect_audits`; UI lists filter to
  `status='complete'`. App wiring: `rank/actions.ts`, `prospect/actions.ts`.
- NOTE: the SERP cap here is **monthly** (`SERP_MONTHLY_SCAN_CAP=15`,
  `AGENCY_MONTHLY_AUDIT_CAP=30`), not daily. There is **no "map credits"** column
  in this codebase — that concept from the audit prose doesn't exist.

---

## 4. Security 016 — input & boundary hardening (app-only, no migration)

Commit `0d1de63`. All in application code:
- **SEC-H2** — `api/generate/route.ts` caps `topic` (500) / `context` (4000) /
  each extra (500), and accepts extras **only** for keys declared in the post
  type's `extra_fields.inputs`. Client mirrors with `maxLength`.
- **SEC-M3** — extras merged **first**, built-in clinic vars **last**; reserved
  keys rejected. User input can't override clinic identity or the YMYL block.
- **SEC-M2** — `AbortSignal.timeout(10s)` on serper/serpapi fetches; the two
  Anthropic generation clients use `timeout: 60s, maxRetries: 1`.
- **SEC-M5** — `isAdminRole` guard added to `saveContent`, `markPublished`,
  `deleteContent`, `addKeyword`, `runScan` (RLS still scopes tenancy).
- **SEC-H3** — HTML-escape clinic/doctor names in the welcome email; in-memory
  IP+email rate limit on signup (`lib/rate-limit.ts` — best-effort, per-instance;
  see note there for a shared-store upgrade).
- **SEC-L3** — auth-callback `next` validated as a same-site path (`^/(?!/)`).
- **SEC-L5** — password minimum raised 6 → 8 (signup, staff, reset — server +
  client).

### ⚠️ STILL TO DO — two Supabase dashboard toggles (user, not code)
1. **Leaked-password protection** → Authentication → Policies / Attack Protection
   → enable "Leaked password protection" (HaveIBeenPwned).
2. **Disable public email sign-ups** → Authentication → Providers → Email → turn
   OFF "Enable Sign-ups". Safe: the admin API (onboarding) bypasses it, and login
   still works. Confirmed the service-role signup is the ONLY path that mints a
   credited clinic.

---

## 5. Features shipped

### Pipeline List / Board toggle (`9714016`)
- `/pipeline` now has a **List | Board** toggle (remembered per browser).
- Board = Kanban: columns Identified · Presented · Thinking · Accepted ·
  Scheduled (header = count + total ₹); Completed/Rejected in a footer row.
  Cards show patient, treatment, ₹, follow-up (red if past).
- **Native HTML5 drag-and-drop** does the SAME transitions + side-effects as the
  List buttons (Thinking→date popup, Rejected→reason popup, Accepted→notification
  + recovery win, Accepted→Scheduled→Book Appointment popup). Invalid moves snap
  back with an explaining toast. Mobile = horizontally swipeable columns.
- Files: `pipeline-board.tsx`, `pipeline-tabs.tsx`, `page.tsx`.
- **Caveat:** native DnD is desktop/mouse only — on Android Chrome the Board is
  swipe-to-view and moves are done from the List view (fully functional). Offered
  a pointer-events layer for touch drag; not built.

### Clinic location set once (`bd71627`)
- Root problem: receptionists were typing lat/lng per keyword, and
  `clinics.default_lat/lng` (migration 007) were orphaned (never populated).
- Now: `clinics.default_lat/lng` set **once in Settings** (no migration — columns
  existed). New shared `components/location-picker.tsx` + `lib/geo.ts`: "Use my
  current location" (GPS), paste a Google Maps link / "lat,lng" (parsed), or edit
  manually. No maps library.
- Rank: Add Keyword no longer asks for coordinates; `addKeyword` derives centre
  from the clinic and **`runScan` centres on the clinic's CURRENT location**
  (single source of truth). If unset, `/rank` shows a "set your location" prompt
  and blocks add/scan with a clear message.
- Prospect audit reuses the same picker for its **per-audit** (other-business)
  location, which correctly stays independent of the clinic.

---

## 6. Serper debugging pass (instrumentation only)

Two commits add **debug-gated** logging (`SERP_DEBUG=1`), **no logic change**:
- `454045a` — `lib/serp/serper.ts`: logs the full outgoing request (endpoint
  `/maps`, params `q/ll/gl/hl`, node lat/lng) and which array is parsed.
- `db79d37` — `lib/serp/match.ts`: per node, logs target + each top-10
  candidate's placeId/name/match-rule + a diagnostic token-overlap + resolved
  rank. The decision lives verbatim in `resolveRank()`; `matchTarget` only wraps.

**Findings (verified with live 3-node probes against the real Serper API):**
- Request path is **correct**: `/maps` engine, distinct `ll` per grid node
  (results genuinely shift by location), reads the **`places` map pack** (there is
  no `organic` array on `/maps`). We send **no** `location`/`num`/`device` — for
  `/maps`, `ll` is the geo origin, which is right.
- Match step is **healthy**: probed real clinic "ABCD" / target "Surana Dental
  Clinic" / keyword "root canal treatment in vijay nagar". Centre + SE node →
  exact match, rank 1; NW corner → genuinely absent from the pack → null
  (→ `NOT_FOUND_RANK=21` for averaging, by design). No identity or aggregation bug.

**Latent risk (diagnosed, NOT fixed — offered):** matching is substring
containment with **no similarity threshold**, and this keyword has
`target_place_id = null`. It works only because the stored `target_business_name`
exactly equals the Google listing. If a listing name drifts, matching would fail
at every node. **Recommended next step:** capture + store the Google `place_id`
when a keyword is added (the matcher already prefers `place_id`). Not built yet.

---

## 7. "Could not start the scan" bug (`791b851`)

- Symptom: scans failed instantly with a vague message.
- Root cause: `runScan`/`runAudit` call the migration-015 reserve RPCs; when 015
  wasn't applied, PostgREST returned **PGRST202** ("function not in schema
  cache"), which the catch swallowed into the generic string.
- Fix (code): log the full reserve error and return a **specific** reason
  (cap reached / missing-function → "run migration 015" / other DB error). On
  total provider failure, surface the real provider error (e.g. "Serper request
  failed (429)"). Same treatment on the audit path.
- **Now moot at runtime** because migration 015 has been applied — but the better
  error handling stays.

---

## 8. Verification status

- ✅ `tsc --noEmit` + `next lint` clean after every commit; dev server boots.
- ✅ Serper request + match paths verified with **live probes** (real API + real
  DB row via service role).
- ✅ Pipeline board + LocationPicker verified by rendering on a throwaway public
  route (the app is auth-gated in this environment) — layout, drag structure,
  GPS/paste parse, red past-due date all confirmed. Temp routes + middleware
  tweak reverted.
- ❌ **No full auth-gated click-through** of the new flows (no login session in
  this environment): the credit/scan reserve+refund end-to-end, a real in-app
  scan, the pipeline drag→DB transition, Settings location save → scan. All are in
  `TESTING.md` for a logged-in pass.

---

## 9. Open threads / offered, not built

- **SEC-016 dashboard toggles** (§4) — leaked-password protection + disable public
  signup. User action.
- **`place_id` capture** for robust Map-Rank matching (§6) — the one real latent
  risk found in the Serper pass.
- **Touch drag** on the pipeline Board for Android (pointer-events layer).
- **Rate limiter** upgrade to a shared store (Upstash) for a hard cross-instance
  cap (currently best-effort in-memory).
- Prior deferred: CSV export, duplicate-patient merge, bulk WhatsApp campaigns,
  self-booking portal, churn-risk insights; approve/reject review layer for
  `/history`; enrich the help KB past ~4,096 tokens to activate Haiku caching.
- **Branch `growth-features-serp` is not pushed / not merged.** Undecided whether
  to push origin / fast-forward `main`.

---

## 10. Gotchas / operational notes

- **One dev server per repo** — two `next dev` on the same `.next/` clobber each
  other. If the app looks wrong, suspect a second server first.
- **`SERP_DEBUG=1`** turns on the Serper request + match debug logs (off by
  default). `SERP_PROVIDER=serper` with a real `SERPER_API_KEY` is live in
  `.env.local`; `mock` is the safe default elsewhere.
- **Windows/Git Bash:** quote paths containing `(app)`. Heredocs mangle `\\` in
  regexes — write test scripts with the Write tool, not `cat <<`.
- Chatbot is free; generation / insight / publish / scan still cost credits (now
  reserved atomically).
- `TESTING.md` has per-feature checklists including the new Security 014/015/016,
  pipeline board, clinic-location, and scan-error sections.
