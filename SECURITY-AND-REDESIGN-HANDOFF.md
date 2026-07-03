# Handoff — Security Audit + "Clinical Minimal" Redesign

Session date: **04 Jul 2026** · Branch: **`growth-features-serp`**

This session did two things: (1) a full-codebase security audit run by four
parallel auditors, and (2) an Apple-style "Clinical Minimal" redesign of the UI
foundation. Read `CLAUDE.md` first (permanent rules — the design section was
rewritten this session). This doc is the pickup point.

> **Top priority next session:** fix **SEC-C1** and **SEC-C2** below — a
> receptionist can promote themselves to owner *and pivot into another clinic's
> data*. That is the worst-case bug the project explicitly guards against. It is
> a **database (RLS) fix**, so it needs a new migration (**014**) and cannot be
> patched from app code alone.

---

## 0. What shipped this session

- **4 commits of last session's feature work** were committed first (they were
  uncommitted in the tree): RBAC + staff, journey nav + intro, AI Visibility,
  UX fixes. See `git log` (`c871bf1`…`69dda94`).
- **1 commit: the redesign** (`5f1b57d`) — see §2.
- **0 code changes from the audit** — you chose *report, then fix*. All findings
  are below in §1, ranked. Nothing is patched yet.

Everything is on `growth-features-serp`, **not merged to `main`, not pushed.**
`tsc --noEmit` is clean; the login page renders correctly in the new style with
no console errors (only unauthenticated page verifiable without a login).

---

## 1. SECURITY AUDIT — findings, ranked

Four auditors swept: multi-tenancy/RLS, auth/authz, injection/XSS, and
secrets/weak-code. **No code was changed.** Fix in this order.

### 🔴 CRITICAL — fix before anything else

#### SEC-C1 — A user can rewrite their own `role` / `home_clinic_id` (privilege escalation → full cross-tenant takeover)
- **Where:** `supabase/migrations/001_init.sql:753-756` — the `profiles_update`
  policy is `using (id = auth.uid()) with check (id = auth.uid())` with **no
  column restriction**, and there are no column-level grants or guard trigger.
- **Why it's critical:** `profiles` is the source of truth for tenancy/authz.
  `current_clinic_id()`, `current_user_role()`, `is_clinic_admin()`, `is_agency()`
  all read it (SECURITY DEFINER, trusted downstream).
  - `update profiles set role='clinic_owner' where id=myId` → instant admin
    everywhere (staff mgmt, generate, publish, rate-card/clinic writes).
  - `update profiles set home_clinic_id='<victim-uuid>'` → **every** clinic-scoped
    RLS policy now resolves to the victim clinic. Full read/write of another
    clinic's patients, billing, everything. Only barrier is knowing a UUID, and
    UUIDs leak.
- **Fix (migration 014):** stop users mutating security columns on their own row.
  Cleanest: `revoke update on profiles from authenticated;` then
  `grant update (full_name) on profiles to authenticated;` (allow only safe
  columns). Or a `BEFORE UPDATE` trigger that raises if `role`/`home_clinic_id`/
  `is_agency` change for a self-update. Keep the signup/service-role path working
  (there `auth.uid()` is null).
- **Note:** this also silently undermines the whole RBAC feature shipped last
  session — the app-layer `isAdminRole()` checks read the same self-writable row.

#### SEC-C2 — Public GoTrue signup can forge `role` / `home_clinic_id` via user metadata
- **Where:** `supabase/migrations/001_init.sql:799-818` (`handle_new_user`) trusts
  `raw_user_meta_data ->> 'role'` and `'home_clinic_id'`. The app's own signup
  sets these safely server-side, **but** the public `POST /auth/v1/signup` GoTrue
  endpoint (anon key) also populates `raw_user_meta_data` — if email signups are
  enabled at the project level (Supabase default), an attacker self-registers
  with `data:{ role:"clinic_owner", home_clinic_id:"<victim>" }` → owner in the
  victim clinic. Same takeover as C1, no existing account needed.
- **Fix:** (a) confirm/disable public email signups in Supabase Auth settings
  (this app onboards via the admin API); and (b) defense-in-depth in the trigger:
  hard-default `role='receptionist'` and ignore metadata `home_clinic_id` for
  self-serve signups; only the service-role path sets clinic linkage.

### 🟠 HIGH

#### SEC-H1 — Credit deduction is non-atomic (TOCTOU + lost update) → unlimited Claude spend
- **Where (all three paid paths):**
  `app/api/generate/route.ts:128-137` + `:225-230`;
  `app/(app)/reviews/actions.ts:94-99` + `:249-254`;
  `app/(app)/generate/landing-actions.ts:81-86` + `:174-179`.
- **What:** each does read `credits_used` → check → (long Claude call) →
  `update … set credits_used = staleRead + cost`. N parallel requests all pass
  the check *and* the write is last-write-wins, so N generations get charged as
  **one**. Fire 50 concurrent POSTs with 1 credit left → 50 paid Claude calls.
- **Fix:** atomic reserve in SQL before the Claude call, refund on failure —
  mirror the existing `record_payment` RPC pattern:
  `UPDATE clinics SET credits_used = credits_used + p_cost
   WHERE id = current_clinic_id() AND monthly_credits - credits_used >= p_cost
   RETURNING credits_used;` (reject if no row returned). This also fixes **L1**
  (swallowed deduction errors returning success).

#### SEC-H2 — Unbounded user input flows into Claude prompts → input-token cost abuse
- **Where:** `app/api/generate/route.ts:140-157` — `body.topic`, `body.context`,
  and all `body.extras` values are interpolated into the prompt with **no length
  cap** and extras allows unlimited arbitrary keys. Client has no `maxLength`
  either.
- **Exploit:** `{ context: "<500KB>" }` → ~150K input tokens billed for a fixed
  1–3 credit charge. Compounds with H1.
- **Fix:** cap `topic` (~500) / `context` (~4000) / each extra (~500) chars; only
  accept extras keys declared in the post type's `extra_fields.inputs`.

#### SEC-H3 — Unauthenticated signup abuse + unescaped welcome-email HTML
- **Where:** `app/signup/actions.ts:26-131` (service-role, `email_confirm:true`,
  no rate limit/CAPTCHA, 100 free credits/clinic via `001_init.sql:152`);
  `lib/email.ts:34-53` interpolates `clinicName`/`doctorName` into email HTML
  **unescaped**.
- **What:** scripted signups mint unlimited 100-credit clinics; and since the
  email is never verified, an attacker signs up *as the victim's address* with
  `clinicName = <a href="https://evil">…</a>` → your Resend domain delivers
  attacker HTML to the victim (phishing + sender-reputation burn).
- **Fix:** rate-limit signup (IP+email), add CAPTCHA or drop `email_confirm`, and
  HTML-escape the interpolated fields in `lib/email.ts`.

### 🟡 MEDIUM

- **SEC-M1 — SERP scan/audit budget is racy (TOCTOU, huge window).**
  `lib/serp/budget.ts:23-35,51-63` counts existing rows at the *start*; the
  `rank_scans`/`prospect_audits` row is inserted only *after* a multi-second
  49-call scan. 20 parallel `runScan` near the cap → ~980 billable Serper calls.
  Failed final insert (`rank/actions.ts:195`) also leaves paid calls uncounted.
  **Fix:** insert a `running` row *before* calling the provider (reserves quota),
  or enforce in a DB trigger/RPC.
- **SEC-M2 — No timeout on SERP fetches.** `lib/serp/serper.ts:34-44`,
  `lib/serp/serpapi.ts:42` — no `AbortSignal`. A hung provider stalls the server
  action until the platform kills it (you pay full duration). **Fix:**
  `AbortSignal.timeout(10_000)`; also consider `new Anthropic({ timeout, maxRetries:1 })`.
- **SEC-M3 — `extras` can override system-prompt vars.**
  `app/api/generate/route.ts:141-157` merges extras *after* built-ins, so
  `extras:{ clinic_name:"…ignore prior rules…" }` rewrites `{{clinic_name}}` in
  `SHARED_SYSTEM_PROMPT` / the YMYL brand-safety block. **Fix:** merge extras
  first, built-ins last (or reject reserved keys).
- **SEC-M4 — No rate limit beyond credits on Claude endpoints.** Add a per-user
  concurrency / req-per-minute limiter (in-memory or Upstash).
- **SEC-M5 — Marketing/rank server actions enforce session but not the admin
  role their pages require.** `app/(app)/rank/actions.ts` `addKeyword` (no auth
  beyond `clinicId()`), `runScan` (session only, no `isAdminRole`) — the `/rank`
  *page* is `requireAdmin()` but a receptionist can call the actions directly and
  burn SERP budget. Also `generate/actions.ts` `saveContent`, and
  `history/actions.ts` `markPublished`/`deleteContent` (no auth at all — RLS saves
  the tenancy but a receptionist can delete the clinic's content). **Fix:** add
  `isAdminRole`/`assertAdmin` to these for parity. *(Low data risk — RLS still
  scopes to own clinic — but an inconsistent boundary.)*

### 🟢 LOW (defense-in-depth / hardening)

- **SEC-L1** — Failed credit deduction is swallowed (`console.error`) and the
  response still returns success. Fixed by H1's reserve-first RPC.
- **SEC-L2** — `sanitizeHtml` (`lib/landing-html.ts:105-130`) is a **regex**
  sanitizer serving public `/p/...` pages. It's an allowlist that strips *all*
  attributes (except a scheme-checked `href` on `<a>`) and all non-allowlisted
  tags — **no known bypass today**, and it's Claude-output-only. But its safety
  hinges entirely on "no attribute ever passes through"; a future edit adding one
  attribute passthrough (e.g. `colspan` on tables) reopens XSS *on the app's own
  origin*. Protocol-relative `//evil.com` links pass the `^/` branch (link
  injection, not script). **Fix before user-editable pages ship:** swap in
  `isomorphic-dompurify` / `sanitize-html`; drop the `/` href branch or restrict
  to a known prefix.
- **SEC-L3** — Auth callback `next` param (`app/auth/callback/route.ts:10,16`) is
  **not** exploitable today (origin is always prepended) but should be
  path-validated (`^/(?!/)`) as defense-in-depth.
- **SEC-L4** — `notifications_insert` (`001_init.sql:769`) doesn't constrain
  `target_user_id` to the clinic (same-clinic noise only, no cross-tenant leak).
- **SEC-L5** — 6-char password minimum (`signup/actions.ts:45`,
  `staff-actions.ts:67`) for accounts holding medical/financial data → raise to
  8+, enable Supabase leaked-password protection.
- **SEC-L6** — SerpApi key travels in the URL query string
  (`lib/serp/serpapi.ts:40`, provider-required) — ensure no middleware logs
  outbound URLs.
- **SEC-L7** — ~20 `as unknown as` casts on Supabase join rows — silent
  drift risk between select string and asserted type. Consider
  `supabase gen types` eventually. None security-relevant today.

### ✅ Verified sound (don't re-audit)
Forced RLS on every tenant table with full 4-verb `WITH CHECK` policies keyed to
`current_clinic_id()`; agency-scoped `prospect_audits`; `staff-actions.ts`
service-role surface correctly constrained (own clinic only, can't mint owner,
can't delete cross-clinic, blocks self/owner removal); money RPCs
(`record_payment`/`log_visit`) atomic + clinic-re-derived; public token surfaces
(`/audit/[token]`, `/p/...`) go through minimal SECURITY DEFINER RPCs with
`gen_random_uuid` tokens; **zero** `dangerouslySetInnerHTML`; no `Math.random`
for tokens; no unguarded `JSON.parse` of external data; secrets are server-only
(`import "server-only"`, no `NEXT_PUBLIC_` leak, `.env.local` untracked); error
messages sanitized before reaching the client; `nowIST` timezone logic correct.

**One-line posture:** tenancy and secrets are disciplined; the real risks are
(1) the `profiles` self-update escalation (C1/C2 — must fix) and (2) a family of
non-atomic "check budget → do expensive thing → write usage" races that make all
spend caps advisory (H1/H2/H3/M1). Most fixes are one pattern: move the
reservation into atomic SQL before the paid call.

### Suggested fix batching
1. **Migration 014** — SEC-C1 (`profiles` column lockdown) + SEC-C2 (trigger
   hardening) + SEC-L4. *Ship this alone, first.*
2. **Migration 015 + app** — atomic credit RPC (H1/L1) + atomic SERP reserve (M1),
   wired into the 3 generate paths + 2 scan paths.
3. **App-only** — input caps (H2), extras ordering (M3), action role guards (M5),
   fetch timeouts (M2), email escaping + signup throttle (H3), `next` validation
   (L3), password min (L5).

---

## 2. REDESIGN — "Clinical Minimal" (Apple-style)

Committed in `5f1b57d`. The old "Clinical Fresh" (deep-teal sidebar, mint
accents, Sora display face) → **Clinical Minimal**: nearly colourless neutrals,
generous whitespace, **teal as the single accent**, one Inter family, frosted-
glass overlays.

**`CLAUDE.md` rule #2 was rewritten** to make this the permanent spec — read it
before styling anything new.

### What changed (the foundation)
| File | Change |
|---|---|
| `tailwind.config.ts` | Neutral palette: `ink`→`#1D1D1F` (text), `border`→`#E8EAED` hairline, `subtle`→`#F5F5F7`. `mint` kept only for compat. `font-display` now → Inter (Sora dropped). Softer neutral `shadow-card`. |
| `app/layout.tsx` | Removed the Sora font import/variable — one Inter family. |
| `app/globals.css` | Near-black foreground; global `:focus-visible` teal ring; teal `::selection`. |
| `components/page.tsx` | 28px tight-tracked (`-0.02em`) titles; refined stat-number scale; heavier tracked section headers. |
| `components/app-shell.tsx` | **Sidebar: deep-teal slab → quiet white rail** with a 1px right hairline; active item = soft `bg-black/5` fill + **teal icon** (the only rail colour); tracked uppercase group labels. Header is translucent `bg-white/80` + `backdrop-blur`. |
| `components/modal.tsx`, `toast.tsx` | Frosted-glass scrims (`bg-black/25` + blur); pill-shaped toast. |
| `app/page.tsx` (login), `ai-visibility/score-card.tsx`, `notifications-client.tsx` | Replaced legacy `bg-ink`/`text-mint` and raw-hex outliers with tokens. |

### Why the app-wide look changes from ~10 files
Every page styles through the **design tokens** (`bg-primary`, `border-border`,
`text-primary/secondary`, `bg-subtle`, `shadow-card`) rather than raw colours, so
retinting the tokens reskins the whole app automatically. That's also why there
were almost no per-page edits.

### Verification status
- ✅ `tsc --noEmit` clean; ✅ no `ink`/`mint` stragglers; ✅ login page renders in
  the new style, no console errors.
- ❌ **Authenticated pages not visually checked** (auth gate, no login in this
  env — same blocker as prior sessions). The token approach means they *should*
  all reskin, but the dashboard, list pages, and AI-Visibility ring should get a
  real click-through once you can log in.

### Redesign follow-ups (optional polish, not blockers)
- 5 remaining `font-display` classes now render as Inter (harmless, redundant) —
  strip them for cleanliness whenever touching those files.
- Chart/heatmap colour constants still use raw hex (`dashboard/page.tsx`,
  `competitors/gap-map.tsx`, `components/heatmap.tsx`) — semantic status colours,
  fine to leave, but could move to tokens.
- Per-page spacing/typography pass once logged in — the foundation is set, but
  individual dense screens (dashboard, pipeline) may want more whitespace to
  fully land the "premium" feel.

---

## 3. Git state
- Branch **`growth-features-serp`**, not pushed/merged. Commits this session:
  - `c871bf1` RBAC + staff · `44a0c2b` journey nav + intro · `f5bb376` AI
    Visibility · `69dda94` UX fixes *(last session's work, committed now)*
  - `5f1b57d` **Clinical Minimal redesign**
- Still pending from earlier: run migrations **010–013** (see the prior
  `HANDOFF.md` §1). The new **014/015** above are on top of those.
- **Undecided:** fast-forward `main` / push origin.

## 4. Do-next checklist
1. **Migration 014** — SEC-C1 + SEC-C2 (the critical escalation). Top priority.
2. Migration 015 + app wiring — atomic credit + SERP reservations (H1/M1).
3. App-only hardening batch (H2/H3/M2/M3/M5/L-series).
4. Run migrations 010–013 if not yet applied; log in; click-through the new UI
   (redesign + last session's RBAC/AI-Visibility flows per `TESTING.md`).
5. Decide branch fate (merge/push).
