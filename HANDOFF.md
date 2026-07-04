# HANDOFF — GrowthOS

Read `CLAUDE.md` first (permanent rules — the design section was **rewritten**
this session), then this, then `TESTING.md` (manual checklists per feature) and
`SECURITY-AND-REDESIGN-HANDOFF.md` (the full security audit).
Last updated: **04 Jul 2026**. Branch: **`growth-features-serp`** (not pushed, not
merged to `main`). Working tree is **clean — everything below is committed.**

> **Top priority next session:** fix **SEC-C1 / SEC-C2** (migration 014) — a
> receptionist can promote themselves to owner *and* pivot into another clinic's
> data. Worst-case bug. Details + full audit in
> `SECURITY-AND-REDESIGN-HANDOFF.md`. Then do the **live click-through** (§5).

---

## 0. TL;DR — what this session shipped

All on top of the previously-committed growth suite. Every item is committed,
`tsc`/`lint` clean, and boots clean. **New AI/DB flows are NOT yet click-tested
behind the auth gate** (§5).

1. **Committed last session's uncommitted work** in 4 clean groups (RBAC + staff,
   journey nav + intro, AI Visibility, UX fixes).
2. **Security audit** — 4 parallel auditors. 2 critical, 3 high, 5 medium, 7 low.
   Report only, nothing patched. Full ranked report + fix plan in
   `SECURITY-AND-REDESIGN-HANDOFF.md`.
3. **"Clinical Minimal" redesign** — Apple-style: neutral palette, teal as the
   single accent, white sidebar, one Inter family, frosted-glass overlays.
   Retinted via design tokens, so the whole app reskinned from ~10 files.
4. **Modal overflow bug fixed** — the first-run intro popup no longer flows off
   screen (dynamic viewport height + scrollable body).
5. **FAQ help chatbot** — floating assistant on every page, all roles.
6. **AI CSV data migration** — Settings → Data Migration; auto-detect + AI field
   mapping + import.

---

## 1. Commit map (this session, newest first)

| Commit | What |
|---|---|
| `69e390c` | Help chatbot → Haiku 4.5 + prompt-cache breakpoint |
| `65f2ab6` | TESTING.md checklists (redesign, modal, chatbot, migration) |
| `0d6aca2` | AI-assisted CSV data migration |
| `7d3dfc6` | In-app FAQ help chatbot |
| `dd0d4b8` | Fix modal overflowing viewport |
| `f50005d` | Security-audit + redesign handoff doc |
| `5f1b57d` | "Clinical Minimal" redesign |
| `69dda94` | UX fixes (completed appts collapse, patient last-visit) |
| `f5bb376` | AI Visibility Tracker |
| `44a0c2b` | Journey navigation + "How it works" intro |
| `c871bf1` | RBAC + staff management |

(`9888f68` and earlier = prior sessions.)

---

## 2. Feature — FAQ Help Chatbot

- **What:** a teal floating bubble (bottom-right) on every authed page, for
  **all roles**, that answers "how do I use GrowthOS" questions. Greeting +
  suggestion chips + typing indicator + Enter-to-send + Esc/X to exit.
- **Files:** `components/help-chat.tsx` (widget, mounted in `app-shell.tsx`),
  `app/api/help/route.ts` (server Claude call), `lib/help-kb.ts` (hand-written
  product knowledge base = the system prompt; **no** codebase or patient data).
  Icons `ChatIcon`/`SendIcon` in `components/icons.tsx`.
- **Model / cost:** **`claude-haiku-4-5`** (chosen for cost — ~3× cheaper than
  Sonnet; marketing generation stays on Sonnet). **FREE** — does NOT touch the
  in-app credit system. Hard-capped instead (history len, per-msg + total char
  limits, 700 max_tokens, 30s timeout) to close the SEC-H2 cost-abuse pattern.
- **Prompt caching:** a `cache_control` breakpoint is on the system prompt, but
  it's **dormant** — the KB is ~1,600 tokens and Haiku's minimum cacheable
  prefix is ~4,096. Verified live (`cache_creation_input_tokens: 0`, no error).
  It **activates automatically** if the KB grows past ~4,096 tokens. Deliberately
  not padding the KB to force it (bursty help traffic → cold 5-min TTL → a padded
  cached prompt can cost *more* than the lean uncached one).
- **Verified:** widget renders/opens/closes; a **live** Anthropic call with the
  real KB returns a correct, GrowthOS-specific answer. **Not** verified through
  the auth-gated Next route (needs a login).

## 3. Feature — AI CSV Data Migration (Settings → Data Migration)

- **What:** owner/doctor uploads a CSV from old practice-management software →
  Claude **auto-detects** whether it's patients or treatments and maps its
  columns to GrowthOS fields → user reviews/corrects mapping → previews validated
  rows → imports (clinic-scoped insert). 4-step wizard (upload → map → preview →
  import) with per-step how-to notes + an Exit control.
- **Scope (v1):** `patients` + `rate_cards` (treatments) — the two standalone
  entities. **Appointments/dues deferred** (need patient linkage first).
- **Files:** `lib/data-migration.ts` (entity+field catalog, dependency-free CSV
  parser, shared type coercion — Indian DD/MM/YYYY dates, +91 phones via
  `normalizeIndianPhone`, ₹/comma numbers, gender), `migration-actions.ts`
  (`detectMapping` Claude call + `importRecords`), `data-migration.tsx` (wizard),
  wired into `settings-tabs.tsx`.
- **Security baked in:** admin-gated at the **action** layer too (SEC-M5 lesson);
  only headers + ≤8 truncated sample rows go to the AI, never the whole file
  (SEC-H2); model JSON is parsed with a guard and sanitised against a known
  entity/field allowlist; row/file-size caps.
- **Verified:** 17 pure-logic assertions pass (CSV quoting/escaping/CRLF, date
  formats, phone/number/gender coercion, required-field validation); wizard
  renders. **Not** verified live: the Claude detect + the DB insert (auth-gated).
- **No migration needed** — writes to existing `patients` / `rate_cards`.

## 4. Design — "Clinical Minimal" (redesign)

- Committed `5f1b57d`. **`CLAUDE.md` rule #2 is the permanent spec now** — read it
  before styling anything.
- Tokens (`tailwind.config.ts`): `ink`→`#1D1D1F` text, `border`→`#E8EAED`
  hairline, `subtle`→`#F5F5F7`; **teal `#0D9488` is the single accent**; `mint`
  is legacy — avoid. One Inter family (`font-display` now resolves to Inter;
  Sora dropped).
- Sidebar: **white rail + hairline** (not the old teal slab); active item = soft
  fill + **teal icon**. Header/modals/toasts use frosted-glass (`backdrop-blur`).
- Because everything styles through tokens, pages reskinned automatically.
- **Bug fixed** (`dd0d4b8`): `components/modal.tsx` is now a flex column (pinned
  header, scrollable body) capped with `dvh` — the intro popup no longer
  overflows; the "Got it" button is always reachable on mobile. Verified at
  desktop + mobile viewport sizes.

---

## 5. Verification status & the big next job

- ✅ `tsc --noEmit` + `next lint` clean; dev server boots; redesign confirmed
  live on the login page; help chatbot answer verified via a direct API call.
- ❌ **No auth-gated click-through** of: the chatbot through its Next route, the
  CSV migration detect+import, or any of last session's RBAC / AI-Visibility
  flows. Same standing blocker — no logged-in session in this environment.
- **Next session:** run migration **014** (security fix, §6), log in as owner,
  then walk the `TESTING.md` checklists — especially: add a receptionist via
  Settings → Staff (RBAC), run a real AI-Visibility check session, import a CSV,
  and ask the chatbot a few questions.

---

## 6. Security — MUST-FIX, unpatched (full detail in the security handoff)

Report-only this session; nothing patched. Ranked list + exploit scenarios +
fix code in `SECURITY-AND-REDESIGN-HANDOFF.md`. The headline items:

- 🔴 **SEC-C1** — `profiles_update` RLS policy (`001_init.sql:753`) has no column
  restriction → a user can `update profiles set role='clinic_owner'` (self-
  promote) or `set home_clinic_id='<victim>'` (**full cross-tenant takeover**).
- 🔴 **SEC-C2** — `handle_new_user` trigger trusts signup metadata `role` /
  `home_clinic_id`; same escalation via public GoTrue signup.
- 🟠 **H1/H2/H3** — non-atomic credit deduction (double-spend), unbounded prompt
  input, unthrottled + unescaped-email signup.

**Suggested batching:** migration **014** = C1 + C2 (+ L4) *first, alone*;
migration **015** + app = atomic credit/SERP reservations; then an app-only
hardening batch. C1/C2 are a **DB fix** — app code can't patch RLS.

---

## 7. Migrations to run (Supabase SQL Editor)

- **Pending from before:** `010_insight_report`, `011_landing_page_plans`,
  `012_topic_suggestions`, `013_roles_rbac`. Verify with
  `select current_user_role();` and `select name, topic_bank from post_types;`.
- **To be written:** `014` (SEC-C1/C2), `015` (atomic credit + SERP reserve).
- The new **chatbot** and **CSV migration** features need **no migration**.

---

## 8. Branch & open threads

- Branch `growth-features-serp`, **not pushed, not merged.** Repo convention is
  committing to `main`; we're on a branch per the default-branch guardrail.
  **Undecided:** fast-forward `main` / push origin.
- **Open / offered, not built:**
  - Security fixes (§6) — the priority.
  - Live click-through (§5).
  - Feature menu offered: CSV **export**, duplicate-patient merge, bulk WhatsApp
    campaigns, patient self-booking portal, churn-risk insights.
  - Enrich the help KB past ~4,096 tokens to both improve answers **and** activate
    prompt caching on Haiku (offered; not done — see §2).
  - Prior deferred: approve/reject review layer for `/history` (would be a new
    migration), publish-from-`/history`, SERP auto-fill for Google AI Overview.

## 9. Gotchas / operational notes

- **One dev server per repo.** Two `next dev` against the same `.next/` clobber
  each other's chunks → broken interactivity + stale CSS. This bit us twice this
  session. If the app looks wrong, suspect a second server before the code.
- **Do NOT run `next build` while `next dev` is running** (shared `.next/`).
- **Windows/Git Bash:** quote paths containing `(app)`.
- **Chatbot is free; generation/insight/publish still cost credits.**
- **RBAC fail-closed** — but see SEC-C1: the DB backstop is undermined until 014.
