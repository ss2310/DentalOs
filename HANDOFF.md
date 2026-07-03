# HANDOFF — GrowthOS

Snapshot so a new session can pick up without this chat. Read `CLAUDE.md` first
(permanent rules), then this, then `TESTING.md` (manual checklists per feature).
Last updated: **04 Jul 2026**.

> Next session: run migration **013** (§1), log in, and walk the TESTING.md
> checklists for this session's work (§2–§5) — **none of it is click-tested live
> yet**. All work is on branch **`growth-features-serp`** and is **uncommitted**
> in the working tree (§6).

---

## 0. TL;DR — where we are

This session shipped **three big features** plus **three UX fixes**, all on top of
the existing growth suite:

1. **Journey-based navigation + "How it works" intro** — the flat 8-tab "Clinic
   Operations" group became three plain-language stages; a first-run walkthrough
   modal explains the product.
2. **Role-based access (RBAC) + Staff management** — `profiles.role`
   (owner/doctor/receptionist) now actually gates the app; owners can create
   receptionist accounts in Settings → Staff.
3. **AI Visibility Tracker** (`/ai-visibility`) — scorecard, manual check-session
   flow, matrix, citation sources, trend, WhatsApp export, and a prospect tie-in.
4. **UX fixes:** completed appointments collapse out of the day view; the
   patient page surfaces "Last visit"; AI Visibility moved under **Marketing**.

Everything is **type-checked, linted, and boots clean**. **None of it has been
clicked through live end-to-end** — the auth gate blocks it without a login
(see §7). That's the top job next session.

Prior features (Monthly Insight Report, hosted landing pages, topic-suggestion
dropdowns) are unchanged — see git history + their TESTING.md sections.

---

## 1. RUN THIS MIGRATION FIRST (Supabase SQL Editor)

| File | What it does | Verify |
|---|---|---|
| `013_roles_rbac.sql` | Adds `current_user_role()` + `is_clinic_admin()` helpers and tightens `clinics` / `rate_cards` **writes** to owner/doctor. **No new column** — `profiles.role` already exists. | `select current_user_role();` runs; a receptionist `update clinics …` is rejected by RLS |

- **The app degrades gracefully without it** — nav/route/action guards (app-level)
  still work; only the DB-level write backstop is inactive until it's run.
- **AI Visibility needs NO migration** — its tables (`ai_visibility_queries`,
  `ai_visibility_checks`) and `prospect_audits.ai_visibility_summary` all shipped
  in **007** (already applied).
- **Still pending from the prior session (if not yet run):** `010_insight_report`,
  `011_landing_page_plans`, `012_topic_suggestions`. Verify with
  `select name, topic_bank from post_types;` (three NULLs) and
  `select plan from clinics;` (returns a value).

---

## 2. Feature — Journey navigation + "How it works" intro

- **Nav:** `components/app-shell.tsx` — one flat "Clinic Operations" group →
  three journey groups: **Get Patients In** (Enquiries=Leads, Treatment
  Plans=Pipeline), **Run the Clinic** (Appointments, Patients), **Get Paid & Keep
  Them** (Payments=Billing, Check-up Reminders=Recalls, Reviews, Revenue
  Recovered=Recovery). Page titles renamed to match.
- **Intro:** `components/how-it-works.tsx` — auto-opens on first login
  (`localStorage` flag `growthos:intro-seen:v1`), reopenable from a header **"How
  it works"** button (`HelpIcon`). It's the screen to screen-share when demoing.
- Icons added: `HelpIcon`, `AiVisibilityIcon` in `components/icons.tsx`.

## 3. Feature — Role-based access (RBAC) + Staff

- **Roles:** `clinic_owner` / `doctor` / `receptionist` (owner=doctor=full;
  receptionist=front-desk subset). Signup already makes the creator a
  `clinic_owner`, so **existing accounts see everything** (backward-compatible).
- **Enforcement (4 layers):**
  1. **Nav filter** — `AppShell` gets `isAdmin` from the layout; `adminOnly`
     entries (Revenue Recovered, Marketing group, Settings) hidden from receptionists.
  2. **Route guards** — `lib/roles.ts` `requireAdmin()` on `/settings`,
     `/recovery`, `/generate`, `/rank` (+`[id]`), `/competitors`,
     **`/ai-visibility`** (+`/session`).
  3. **Action/API guards** — `assertAdmin`/inline checks on the generate API
     (403), insight report, hosted-page publish, all settings + staff mutations,
     and AI-Visibility actions.
  4. **RLS (migration 013)** — `clinics` + `rate_cards` writes locked to owner/
     doctor. (Reads stay open; revenue reads are NOT RLS-blocked to avoid breaking
     the dashboard — the *pages* are hidden instead.)
- **Staff:** Settings → **Staff** (`staff-manager.tsx` + `staff-actions.ts`) —
  owner adds a teammate (name/email/temp password/role) via the service-role
  admin API; lists members; Remove blocked for self + the Owner row.
- **Also:** Dashboard hides money stat-cards (Plan Value, Recovered) for
  receptionists; Reviews → Insights tab is owner/doctor-only.
- **Key file:** `lib/roles.ts` (`getUserRole`, `isAdminRole`, `requireAdmin`,
  `assertAdmin`, `ADMIN_ROLES`).

## 4. Feature — AI Visibility Tracker (`/ai-visibility`)

- **What:** tracks how often ChatGPT / Gemini / Perplexity / Google AI Overview
  cite the clinic. **Manual** check recording (a human runs the queries); SERP
  auto-fill for Google AI Overview is a flagged **TODO**, not built.
- **Scorecard:** ring (red <20 / amber 20–60 / green >60) = % of (active query ×
  4 engines) whose *latest* check is cited; per-engine sub-scores.
- **Query set:** "Generate Query Set" seeds ~12 templated queries across 6 layers
  from clinic name/area/city; editable + "+ Add Query".
- **Check session** (`/ai-visibility/session`): stepper over query×engine combos,
  three buttons (Cited/Mentioned/Absent), optional sources/excerpt/position,
  auto-save + auto-advance.
- **Results:** matrix (tap a cell for history), citation-sources aggregation
  (the actionable "where AI cites others" list), per-session trend.
- **Prospect tie-in** (agency-only): `/prospect/[id]/ai-visibility` runs the same
  stepper *in-memory* (a prospect has no `clinic_id`) and writes
  `prospect_audits.ai_visibility_summary` → the **public audit report's AI
  section lights up** (matched its existing shape + added a findings list).
- **Export:** "Copy Scorecard Summary" → WhatsApp/email text block.
- **Files:** `lib/ai-visibility.ts` (templates + scoring + summary/export
  builders), `app/(app)/ai-visibility/*`, `saveProspectAiSummary` in
  `prospect/actions.ts`, R3 report + type extensions in `app/audit/[token]` and
  `lib/types.ts`. **No migration.**

## 5. UX fixes this session

- **Completed appointments** (`appointments-list.tsx`): `completed` now collapses
  into a "Show completed (n)" toggle (like cancelled/rescheduled) so the day view
  stays focused on what still needs action. Empty-active state reads "All N …
  are done ✓".
- **Patient "Last visit"** (`patients/[id]/page.tsx`): a prominent last-visit line
  in the header (date · treatment). NB: full **Visit History already existed** —
  this just surfaces the most recent at a glance for the doctor.
- **AI Visibility → Marketing** (`app-shell.tsx`): moved from a standalone
  top-level item into the **Marketing** group. ⚠️ **Consequence:** Marketing is
  owner/doctor-only, so AI Visibility is **no longer visible to receptionists**
  (reverses the original "all roles" intent). Route/action guards were added to
  match. If you want receptionists to keep it, move it back out of Marketing and
  drop the `requireAdmin()` calls + the role check in `ai-visibility/actions.ts`.

---

## 6. Branch, commits, and git state

- **Branch:** `growth-features-serp`. **Not pushed, not merged to `main`.**
- ⚠️ **This session's work is UNCOMMITTED** — everything above is in the working
  tree only (no commits made this session). Prior features are committed (see
  `git log`, newest `9888f68`). **Ask to commit** when ready; suggested grouping:
  (1) journey nav + intro, (2) RBAC + staff, (3) AI Visibility, (4) UX fixes.
- The repo convention is committing to `main`; we're on a branch per the
  default-branch guardrail. **Still undecided:** fast-forward `main` / push origin.

---

## 7. Verification status

- ✅ `tsc --noEmit` and `next lint` clean; dev server boots + compiles with no
  server/console errors.
- ❌ **No live click-through** of any new flow. Blocker: everything is behind the
  auth gate and there's no logged-in session available in this environment. tsc
  type-checked every new page/action, which covers compile correctness.
- **Next session:** run migration 013, log in as owner, then:
  1. Walk the four new TESTING.md checklists (journey nav; RBAC — needs a
     receptionist account added via Settings → Staff; AI Visibility incl. a real
     check session; the UX fixes).
  2. For the prospect tie-in, run an AI-visibility session from an audit and
     confirm the public `/audit/<token>` report's AI section renders.

---

## 8. Gotchas / operational notes

- **Do NOT run `next build` while `next dev` is running** — they share `.next/`
  and the build clobbers the dev server's chunks. Use `tsc`/`lint` alongside dev.
- **Credits** still govern paid actions (generation, Insight Report=2, publish=1).
  AI Visibility check recording is **free** (no AI call).
- **RBAC fail-closed:** `AppShell` defaults `isAdmin=false` and `requireAdmin`
  treats unknown roles as non-admin — a profile-fetch hiccup shows the
  receptionist view, never an accidental admin view.
- **AI Visibility engines = 4** (chatgpt/gemini/perplexity/google_ai_overview);
  denominators assume all four. Prospect checks are NOT written to
  `ai_visibility_checks` (no clinic_id) — only to the audit summary.
- **Windows/Git Bash:** paths with `(app)` must be quoted in shell commands.

---

## 9. Open threads / not yet built

- **Confirm the AI-Visibility-under-Marketing decision** — it's now owner/doctor
  only (see §5). Revert if receptionists should record checks.
- **SERP auto-fill for Google AI Overview** — flagged TODO in the check flow;
  SerpApi/DataForSEO return AI Overview data (ties into the `lib/serp` layer).
- **Approve/Reject review layer for `/history`** — designed, not built; reversible
  `review_status` on `generated_content`. Would now be **migration 014** (013 is
  RBAC).
- **Publish from `/history`** — a saved page still can't be published without
  regenerating. Offered, not built.
- **Commit + branch fate** — commit this session's work; decide fast-forward
  `main` / push origin (§6).
- **Live testing pass** — the big one (§7).
