# GrowthOS — Handoff

Snapshot of the project so a new session (or person) can pick up without this
chat. Read `CLAUDE.md` first (permanent rules), then this, then `TESTING.md`
(manual test checklists per feature).

_Last updated: 2026-07-03._

---

## 0. Prospecting / Audit — now BUILT (agency-only)

_Scope decision reversed (was "not building")._ On an explicit product call to
serve agency users, the **agency-mode Competitor Intelligence report** is now
built on top of migration `007`'s groundwork (`prospect_audits`, the `is_agency`
profile flag, and the public `get_prospect_audit_by_token()` RPC). No new
migration was needed.

**What it is:** an agency user audits a **non-client** business's Google Maps
visibility (same SERP adapter + the same `buildCompetitorSummary` aggregation as
the clinic-facing Competitor feature — see §11), gets findings + a competitor
table, and shares a **public, branded report** at `/audit/<share_token>` with no
login. It is **agency-scoped, never clinic-scoped**.

**Access:** the **🔎 Prospecting** sidebar item and `/prospect` are gated on
`profiles.is_agency = true` (server redirect for non-agency, plus RLS). Set the
flag per user:
`update profiles set is_agency = true where id = '<user-uuid>';`
As of this build, **no profile had `is_agency` set** — enable it on the agency
owner's login before the menu appears.

**Files:** `/prospect` (list + New Audit), `/prospect/[id]` (detail + Copy
shareable link + an "Add AI Visibility results" button that 404s until R4),
public `/audit/[token]`; server action `runAudit` in
`app/(app)/prospect/actions.ts`; `lib/serp/findings.ts` (plain-English flags);
audit budget in `lib/serp/budget.ts` (`AGENCY_MONTHLY_AUDIT_CAP`, default 30).
`ai_visibility_summary` is left null (R4 will populate it; the report's AI
section renders only when present). Shared UI extracted to
`components/competitor-table.tsx` and `components/heatmap.tsx` (+
`rank-colors.ts`).

---

## 1. What GrowthOS is
Multi-tenant SaaS for Indian dental clinics: (1) practice management — patients,
appointments, billing, treatment pipeline, recalls, leads, revenue recovery; and
(2) AI marketing (content generation + local Map-rank tracking). Users are clinic
receptionists/doctors on Android Chrome + desktop. Stack: Next.js 14 (App Router)
+ TypeScript + Tailwind, Supabase (Postgres + Auth + RLS), Claude API (server-side
only), Vercel hosting.

Every table has `clinic_id`; every query is clinic-scoped and enforced by
Supabase RLS. See `CLAUDE.md` for the design system and non-negotiable rules.

## 2. Where the code lives
- GitHub: **https://github.com/ss2310/DentalOs** (branch `main`).
- Not yet deployed to Vercel.
- Local: `C:\Users\Utsav Goyal\Documents\GrowthOS`.

## 3. Features built (high level)
Auth + app shell; Patients; Appointments (+ 5 WhatsApp actions, inline
new-patient, cancelled/rescheduled hiding); Visit Log; Billing; Pipeline;
Recalls; Leads; Notifications; in-database pg_cron jobs (morning briefing /
weekly maintenance); Operations dashboard; Revenue Recovery dashboard; Content
Studio (`/generate` + `/history`); Settings; Treatment Plan Presenter; Password
reset + welcome email.

**Most recent build phase:**
- **Reviews hub** (`/reviews`) — request Google reviews after completed visits;
  the per-appointment "Request Review" button was consolidated here.
- **Consistent page layout** — shared primitives in `components/page.tsx`
  (`PageHeader`, `StatGrid`/`StatCard`, `SectionHeader`, `EmptyState`). List
  pages now read the same, and **Pipeline / Leads / Billing group rows by state**
  (e.g. Billing by 90+/60+/30+/Current age band) with a sort/total hint.
- **Sidebar reorganised** — Dashboard (top) + **Clinic Operations** and
  **Marketing** collapsible groups + Settings (bottom).
- **Dashboard "Book Appointment"** quick action (reuses the appointments modal).
- **Grid Rank Tracker** (`/rank`, under Marketing) + a pluggable **SERP provider
  adapter** — see §10.
- **Competitor Intelligence** (`/competitors`, under Marketing) — the newest
  feature. Reads a `competitors` aggregate that grid scans now store on
  `rank_scans` (built from the top-10 results each scan already fetches), so it
  makes **no extra SERP calls / costs nothing**. Shows a biggest-threat card, a
  you-vs-rivals table, share of local pack, a gap-map heatmap, a rivals-gaining
  trend, and a copy-to-WhatsApp summary. Migration `008` adds the column;
  `runScan` computes the aggregate (`lib/serp/competitors.ts`).
- **Agency Prospecting** (`/prospect` + public `/audit/[token]`) — agency-only
  cold-audit tool. See §0 (scope reversed) — reuses the SERP adapter + the same
  aggregation as Competitor Intelligence. No new migration (007 groundwork).
- **Content Studio AI-Citable upgrade** (`/generate`) — a "✨ AI-Citable Mode"
  toggle (default ON, web-crawlable/"Website" types only) that injects a shared
  `AI_CITABLE_BLOCK` + hard **YMYL** rules into the system prompt (answer-first,
  question headings, entity-named sentences, all numbers in HTML tables,
  "Last updated: {{today}}", NAP + JSON-LD; never fabricate stats/costs/
  credentials/citations — missing data becomes a visible "[clinic to supply: …]"
  placeholder). Adds `{{today}}`/`{{year}}` template vars, 5 new citable
  "Website" post types (migration `009`), and a "✨ Citable" badge in `/history`.
  Prompt assembly lives in `app/api/generate/route.ts`; types seeded in `009`.
- **"Clinical Fresh" visual redesign** — replaced the generic SaaS-blue theme
  with a dental-native identity: teal primary `#0D9488`, a **deep-teal (`ink`)
  sidebar** with a **mint** active-accent + tooth wordmark, **Sora** display font
  for titles/big numbers (Inter still body), 16px cards with a soft `shadow-card`,
  and a solid-teal **hero** StatCard for the day's headline metric. All driven by
  `tailwind.config.ts` tokens + `components/page.tsx` + `app-shell.tsx`, so it
  cascades app-wide. Design rules updated in `CLAUDE.md §2`. Accessibility held
  (≥4.5:1 contrast, 44px taps, 14px+ text). Per-page ad-hoc button/badge classes
  still use the tokens; migrating them to a shared `Button`/`Badge` is a good
  next cleanup.

## 4. Database — migrations to run (Supabase SQL Editor, in order)
All of these are **already applied** to the live project.
1. `001_init.sql` — schema + RLS + triggers.
2. `002_log_visit.sql` — `log_visit()`.
3. `003_record_payment.sql` — `record_payment()`.
4. `004_notifications.sql` — notification helpers + `run_morning_briefing()` /
   `run_weekly_maintenance()` + pg_cron. **Enable `pg_cron` first.**
5. `005_seed_post_types.sql` — seeds the 10 Content Studio templates.
6. `006_treatment_plans.sql` — `treatment_plans` table + RLS.
7. `007_growth_features.sql` — **growth features schema** (additive, idempotent):
   tables `rank_tracking_keywords`, `rank_scans` (used by the Grid Rank Tracker),
   plus `prospect_audits` (agency — see §0, no UI), `ai_visibility_queries` /
   `ai_visibility_checks`, `automation_rules`, `landing_pages` (schema only, no
   UI yet). Adds `profiles.is_agency`, `clinics.default_lat/default_lng`, and
   `clinics.booking_slug`. Two anon security-definer functions
   (`get_prospect_audit_by_token`, `get_published_landing_page`). After running,
   the owner set `is_agency = true` on their own profile row (not required for
   the rank tracker).
8. `008_competitor_intel.sql` — adds `rank_scans.competitors` (jsonb) for the
   Competitor Intelligence feature (additive, idempotent). No new RLS: it's a
   column on the already clinic-scoped `rank_scans`. **Run this migration**, then
   run a fresh Map Rank scan so a scan carries the competitor aggregate (scans
   from before 008 have `competitors = null` and won't show on /competitors).
9. `009_citable_content.sql` — Content Studio AI-Citable upgrade: adds
   `generated_content.citable_mode` (for the "✨ Citable" history badge) and seeds
   **5 new "Website" post types** (City Dental Stats, Treatment Comparison,
   Clinician Guide (YMYL), Dental Update / What's New, Question Answer Page).
   **Run this** to get the new types + persisted badge. Until it's run, PART 1
   (the AI-Citable toggle on the existing web types) still works, and /history +
   Save degrade gracefully (code has fallbacks — no crash, just no badge).

Optional: `supabase/seed_demo.sql` — realistic demo data for ONE clinic.

## 5. Environment variables
Local `.env.local` (git-ignored) and Vercel → Settings → Environment Variables:

| Var | Purpose | Exposure |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | public |
| `SUPABASE_SERVICE_ROLE_KEY` | signup admin writes | server only |
| `ANTHROPIC_API_KEY` | Content Studio | server only |
| `RESEND_API_KEY` | transactional email | server only |
| `RESEND_FROM` | e.g. `GrowthOS <no-reply@yourdomain.com>` (verified domain) | server only |
| `APP_URL` | your public URL, for the welcome-email button | server only |
| `SERP_PROVIDER` | `serper` \| `serpapi` \| `mock` (unset → `mock`) | server only |
| `SERPER_API_KEY` | Serper.dev key (primary rank provider) | server only |
| `SERPAPI_API_KEY` | SerpApi key (backup rank provider) | server only |
| `SERP_MONTHLY_SCAN_CAP` | scans allowed per clinic per month (default 15) | server only |

After editing `.env.local`, **restart `npm run dev`** — env is read only at boot.

## 6. Supabase dashboard config (one-time)
- **pg_cron**: Database → Extensions → enable, then run `004`. Verify:
  `select jobname, schedule from cron.job;`.
- **Email SMTP** (password-reset emails): Authentication → Emails → SMTP → host
  `smtp.resend.com`, port `465`, user `resend`, password = Resend API key.
- **Redirect URLs**: Authentication → URL Configuration → add
  `http://localhost:3000/auth/callback` and `https://<vercel-domain>/auth/callback`.
- **Map-rank centre (optional but recommended):** set your clinic's map centre so
  the Add-Keyword form pre-fills it:
  `update clinics set default_lat = 28.6139, default_lng = 77.2090 where id = current_clinic_id();`
  (use your clinic's real coordinates).

## 7. Deploy to Vercel (not done yet)
1. vercel.com → import `ss2310/DentalOs`.
2. Add all env vars from §5 (before first deploy).
3. Deploy → get `*.vercel.app` URL → add to Supabase Redirect URLs + Site URL +
   set `APP_URL`.
Production branch is `main`. pg_cron jobs run regardless of Vercel.
**Note for rank scans:** a 7×7 scan makes 49 external calls in one request; on
Vercel's default function timeout this can be tight. Prefer 5×5 (25) there, or
raise the function timeout, until scans are moved to a background job.

## 8. Known issues / caveats
- **Prospecting / audit not built — by design.** See §0.
- **007 tables without UI yet:** `ai_visibility_*`, `automation_rules`,
  `landing_pages` are schema-only (no screens). Only the Grid Rank Tracker
  (`rank_*`) has a UI so far.
- **Rank scans are synchronous.** The whole grid is scanned during the button
  click (bounded to 5 parallel calls). Fine locally; on Vercel keep grids small
  or move to a background job later.
- **Emails land in spam** — add a DMARC DNS record; confirm SPF/DKIM in Resend.
- **Signup pre-confirms email** (`email_confirm: true` in `app/signup/actions.ts`)
  so test clinics are instant. Turn ON "Confirm email" + remove that flag before
  real launch.
- **No payments/billing system** yet (Stripe/Razorpay is a separate feature).
- **Lead "Contact"** doesn't write an interaction row (`interactions.patient_id`
  is NOT NULL and a lead has no patient yet).
- Many authenticated write flows are verified by type-check + code review, not
  all clicked through live. `npx tsc --noEmit` and `next lint` are clean.

## 9. Suggested next steps
1. Deploy to Vercel (§7) and wire the production URL into Supabase + `APP_URL`.
2. Get a Serper.dev key and set `SERP_PROVIDER=serper` for real Map-rank data
   (keep `mock` for testing — it's free and offline).
3. Decide whether the other 007 features (AI visibility, automation, landing
   pages) are worth building for dentists — or park them like prospecting.
4. Walk the `TESTING.md` checklists on the live site.

## 10. Grid Rank Tracker + SERP provider (the newest feature)
**What it does:** tracks where a clinic ranks on Google Maps for a keyword (e.g.
"dentist near me") across a grid of nearby points, and shows a colour heatmap +
average rank + "in top 3 %" over time.

**How the provider layer works (`lib/serp/`, server-only — keys never reach the
browser):** one interface with three swappable adapters chosen by `SERP_PROVIDER`
— `serper` (primary), `serpapi` (backup), and `mock` (free, offline,
deterministic; the **default** when `SERP_PROVIDER` is unset). A 4th provider
(e.g. DataForSEO) can be added later by dropping in one file — no UI changes.

**Which data source / "no model picker":** there is **deliberately no in-app
dropdown** to choose the provider — it's a cost/infrastructure setting, not
something clinic staff should pick. You choose it once via the `SERP_PROVIDER`
env var. Whenever the app is on `mock`, a yellow **"Sample data — not real
ranks"** banner shows on the Map Rank pages and each mock scan is labelled
"sample data", so doctors testing it can never mistake demo numbers for real
Google results. Switch to `serper` (below) for live data before any real test.

**Cost safety / plan limit:** each clinic gets **15 scans per calendar month**
(`SERP_MONTHLY_SCAN_CAP`, default 15). One Run Scan = 1 scan, regardless of grid
size (3×3 / 5×5 / 7×7 all count as one). Usage is counted per-clinic from that
month's `rank_scans` rows (RLS-scoped — no service role needed). When the 15 are
used up, scanning is blocked with a "credit top-ups coming once payments are
live" message. **Credit purchasing is deliberately deferred** until the payment
gateway is added in the deployed stage — the block in `lib/serp/budget.ts` /
`app/(app)/rank/actions.ts` is the seam where "buy more scans" will hook in.
Each grid point still makes 1 metered API request (a 5×5 = 25 calls), so keep
grids at 5×5 to stay near "15 five-by-five scans" worth of API spend per clinic.

### Verify it works — step by step (no coding needed)
You can test the whole thing for **₹0** using the built-in `mock` provider (it
makes up realistic data, no API key, no internet). Do this first.

1. Make sure `.env.local` has `SERP_PROVIDER=mock` (or just leave it unset —
   `mock` is the default). If you changed `.env.local`, stop and restart the app
   (`npm run dev`) so it re-reads the file.
2. Open the app and log in. In the left menu, open **Marketing → Map Rank**.
3. (One-time) If the Add-Keyword form's latitude/longitude are blank, either type
   your clinic's coordinates (e.g. `28.6139` and `77.2090`) or set them once in
   Supabase (§6). To find yours: open Google Maps, right-click your clinic, click
   the lat/long numbers to copy them.
4. Click **+ Add Keyword**. Enter a keyword like `dentist near me`, leave the
   business name (it pre-fills your clinic), leave grid size **5** and radius
   **3**, and save. You should see a toast "Keyword added ✓" and the keyword in
   the list.
5. Click the keyword to open it, then click **Run Scan**. A dialog says *"This
   will make 25 requests (… left in today's budget). Continue?"* — click
   **Continue**.
6. After a moment you should see: a big **Average Map Rank** number, an **In Top
   3 %**, and a **colour grid** (green = ranking well, red/grey = poorly). Tap
   any square to see its coordinates.
7. Click **Run Scan** again — a second bar appears in the **history trend** at
   the bottom (taller bar = better rank).
8. **Check the monthly limit:** the page shows "This month: X/15 scans used" and
   the Run-Scan dialog says it uses "1 of your 15 monthly scans". To see the block
   in action, set `SERP_MONTHLY_SCAN_CAP=1` in `.env.local`, restart, run one
   scan, then try a second — **Continue is greyed out** with a "used all your
   scans this month" message. Put the cap back to `15` afterwards.

### Switch to real Google data (costs money per scan)
1. Sign up at serper.dev, copy your API key.
2. In `.env.local` set `SERP_PROVIDER=serper` and `SERPER_API_KEY=<your key>`.
3. Restart the app. Run a scan — now the ranks are real. Each clinic gets 15
   scans/month; use 5×5 grids to keep API spend near "15 five-by-five scans".
   (SerpApi works the same way with `SERP_PROVIDER=serpapi` + `SERPAPI_API_KEY`.)

If a scan ever fails for every point (e.g. wrong/missing key), it will **not**
save a misleading blank result — you'll get an error toast telling you to check
the provider settings.
