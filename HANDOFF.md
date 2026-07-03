# HANDOFF — GrowthOS

Snapshot so a new session can pick up without this chat. Read `CLAUDE.md` first
(permanent rules), then this, then `TESTING.md` (manual checklists per feature).
Last updated: **03 Jul 2026**.

> Next session: run the migrations in **§1**, then walk the TESTING.md checklists
> for the three features built this session. All work is on branch
> **`growth-features-serp`** — see §5.

---

## 0. TL;DR — where we are

This session added three features on top of the existing growth suite:

1. **Monthly Insight Report** — `/reviews` → **Insights** tab (AI summary of the
   clinic's last 90 days).
2. **Hosted landing pages** — publish a generated Website page as a real hosted
   page at `/p/<booking_slug>/<slug>`, managed in **Settings → Landing Pages**.
3. **Topic-suggestion dropdowns** — Content Studio (`/generate`) Topic field now
   offers curated per-type dropdowns.

All code is **type-checked, linted, and builds clean**. **None of it has been
clicked through live end-to-end** (see §6) — that's the first job next session,
after running the migrations.

---

## 1. RUN THESE MIGRATIONS FIRST (Supabase SQL Editor)

The app **degrades gracefully** if these aren't applied (no crashes — features
fall back to old behaviour), but the new features only fully work once they're
run. Run in Supabase Dashboard → SQL Editor (the `postgres` role bypasses RLS,
needed for the seeds/catalog writes).

| File | What it does | Verify |
|---|---|---|
| `010_insight_report.sql` | Seeds the `Insight Report` post type (`Internal`, 2 credits) | Insights tab button enabled, no "run 010" hint |
| `011_landing_page_plans.sql` | Adds `clinics.plan` (default `starter`) for the per-plan page cap | `select plan from clinics;` returns a value |
| `012_topic_suggestions.sql` | `topic_suggestions` table + `post_types.topic_bank` + 120-row curated seed | `select bank,count(*) from topic_suggestions group by bank;` → 8×15; `select name,topic_bank from post_types;` → 3 NULLs |

Prerequisites `007`/`008`/`009` were applied in earlier sessions (the
`landing_pages` table, `booking_slug`, and the anon `get_published_landing_page()`
RPC that hosted pages rely on all come from 007).

---

## 2. Feature 1 — Monthly Insight Report

- **Entry:** `/reviews` → **Insights** tab → "Generate Monthly Insight Report".
- **Does:** gathers the clinic's last 90 days (survey scores + comments,
  interaction counts by type, appointment no-show rate, recovery outcomes/₹),
  sends to Claude (`claude-sonnet-4-6`, `max_tokens 1500`) for a plain-English,
  4-section owner summary, saves it to `/history`.
- **Cost:** **2 credits**, deducted after success, blocks at 0. Refuses to spend
  a credit when there's zero 90-day activity; instructs the model to say so
  honestly when data is thin (no fabrication).
- **Files:** `app/(app)/reviews/actions.ts` (server action + Claude call),
  `insights-client.tsx`, `reviews-tabs.tsx`, `page.tsx`. Migration `010`.

## 3. Feature 2 — Hosted landing pages

- **Publish:** `/generate` → generate **any Website-platform type** → in the
  Result card, **🌐 Publish as Hosted Page** → slug popup → publish.
- **Public page:** `GET /p/<booking_slug>/<page_slug>` — no login, served as a
  full standalone HTML doc (NOT the app shell) via the anon
  `get_published_landing_page()` RPC. Allow-listed in `lib/supabase/middleware.ts`.
- **Manage:** **Settings → Landing Pages** — list, Copy URL, Open, Unpublish,
  Delete, Download HTML.
- **Cost / limits:** **1 credit** per publish (blocks at 0); **plan-based cap**
  on page count (`lib/plans.ts`: free 1 / starter 5 / pro 25 / agency 200).
- **HTML builder:** `lib/landing-html.ts` — generated copy → full doc (Inter,
  design tokens, mobile-first, NAP header/footer, sticky Call Now, Book CTA).
  Prose is escaped; raw HTML blocks (the citable types' `<table>`s) pass through
  a sanitizer (`sanitizeHtml`, allow-list of structural tags, strips
  scripts/attrs). Unit-tested (15/15).
- **Files:** `app/(app)/generate/landing-actions.ts` (publish),
  `publish-hosted-page.tsx`, `app/p/[bookingSlug]/[pageSlug]/route.ts`,
  `app/(app)/settings/landing-*.{ts,tsx}`, `lib/landing-html.ts`, `lib/plans.ts`.
  Migration `011`.
- **Scope note:** subdomain-hosted **v1**. Custom-domain mapping is intentionally
  **NOT** built (flagged in code comments).

## 4. Feature 3 — Topic-suggestion dropdowns

- **Entry:** `/generate` → pick a type → the **Topic** field becomes a curated
  `<select>` (when the type has a `topic_bank`), with a final
  **"✏️ Something else…"** that reveals a free-text box.
- **Per-type wiring — the dropdown feeds the RIGHT variable:**
  - social/article/guide/update banks → `{{topic}}`.
  - **Service Page / Geo Landing** → prefer the clinic's own active `rate_cards`
    (real treatment names), fall back to the `service` bank if none.
  - Treatment Comparison → the `treatments` input; Question Answer → `question`;
    WhatsApp Broadcast → `{{occasion}}`.
  - City Dental Stats / Review Response / GBP Q&A → **no dropdown** (their
    stats/paste inputs untouched).
- **Geo nuance (handled):** the Geo template only uses `{{target_area}}`, so the
  chosen treatment is folded into `{{context}}` ("Focus treatment to feature: …")
  so the picker actually affects output.
- **Files:** `app/(app)/generate/generate-client.tsx` (picker logic), `page.tsx`
  (loads suggestions + rate_cards), `lib/generate.ts` (`PostType.topic_bank`).
  Migration `012`.

---

## 5. Branch, commits, and git state

- **Branch:** `growth-features-serp` (this session + the prior growth suite).
  **Not pushed, not merged to `main`.**
- The repo's convention is committing straight to `main`; we branched per the
  default-branch guardrail. **Decide next session:** fast-forward `main` to this
  branch and/or push to `origin`.
- This session's commits (newest first):
  - `39bffde` Wire per-type topic dropdowns into Content Studio
  - `dc36f3a` Add topic-suggestion system + Content Studio topic dropdown
  - `0f604cc` Generalize hosted-page HTML: sanitizer + raw-table passthrough
  - `2ba56e6` Publish Geo Landing Pages as hosted websites
  - `2d29cb7` Add Monthly Insight Report to Reviews
- **Working tree:** clean.

---

## 6. Verification status

- ✅ `tsc --noEmit`, `next lint`, `next build` all clean.
- ✅ Unit-tested pure logic: landing-page HTML builder + `sanitizeHtml` (tables
  pass through; scripts/`javascript:`/attrs stripped; prose no-regression).
- ❌ **No live click-through** of any new flow. Two blockers this session:
  1. **Supabase connectivity kept dropping** (`ENOTFOUND
     ihoyerlkezraudchkfxy.supabase.co` / connect timeouts) → intermittent
     logouts. Environmental, not a code bug — retry when the network is stable.
  2. Full flows need the §1 migrations applied.
- **Next session:** run migrations, log in, walk the three new checklists in
  TESTING.md (Insight Report; hosted pages incl. the citable-table viability
  check; topic dropdowns).

---

## 7. Gotchas / operational notes

- **Do NOT run `next build` while `next dev` is running** — they share `.next/`
  and the build clobbers the dev server's chunks (breaks CSS, 404s on
  `layout.css`). Fix: stop dev → `rm -rf .next` → restart dev. Use `tsc`/`lint`
  alongside `dev` (those don't touch `.next`).
- **Credits are the cost governor.** Every paid action decrements
  `clinics.credits_used` and hard-blocks at 0: generation (per
  `post_types.credits_cost`), Insight Report (2), publish hosted page (1).
  Publishing charges 1 credit even though it makes no AI call (product decision).
- **Windows/Git Bash:** paths with `(app)` must be quoted in shell commands.

---

## 8. Open threads / not yet built (candidates for next session)

- **Approve/Reject review layer for `/history`** — proposed and designed, **not
  built**. Idea: a reversible `review_status` (`pending`/`approved`/`rejected`)
  on `generated_content` so rejected pieces are kept and restorable (reject ≠
  delete). Would need a new migration (**013**).
- **Publish from `/history`** — today a page can only be published right after
  generating; a saved page can't be published without regenerating (costs
  credits). Offered, not built.
- **Decide branch fate** — fast-forward `main` / push `origin` (see §5).
- **Live testing pass** — the big one (see §6).
