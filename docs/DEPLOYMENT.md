# GrowthOS — Vercel Deployment Guide

Stack: Next.js 14 (App Router) on **Vercel Pro** + Supabase (Postgres, Auth,
Storage) + Cashfree (payments) + Resend (email). This guide takes a fresh
clone to a working production deploy.

> **Vercel Pro is required**, not optional: the Deep Audit runner cron runs
> every 2 minutes (Hobby allows daily crons only) and several routes set
> `maxDuration` up to 300s (Hobby caps at 60s).

---

## 1. Supabase project

1. Create a project (choose the Mumbai / `ap-south-1` region — the users are
   in India). **Use the Pro plan ($25/mo) for production** — daily backups +
   no auto-pausing; this app stores patient data.
2. **Apply migrations in order.** In the SQL Editor, run every file in
   `supabase/migrations/` by number: `001 → 043` (no gaps, no skips). After
   the batch, run:
   ```sql
   notify pgrst, 'reload schema';
   ```
   The migrations create all tables, RLS policies, RPCs, seed catalogs
   (post types, topic banks, compliance rules, few-shots) AND the four
   private storage buckets (`voice-notes`, `brand-assets`, `social-renders`,
   `capture-photos`) with their object-level RLS. `applied_migrations` tracks
   what ran — re-running a file is safe (everything is idempotent).
3. Auth settings: enable Email provider; set the Site URL to your production
   domain; add it to the redirect allowlist.
4. Collect three values (Project Settings → API):
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (**server-only secret —
     never expose, never prefix with NEXT_PUBLIC**)

## 2. Vercel project

1. Import the GitHub repo; framework auto-detects Next.js. Build command
   `next build`, no overrides needed (`next.config.mjs` already marks
   `@resvg/resvg-js` as a server-external package; the renderer's TTF fonts
   in `assets/fonts/` are bundled by file tracing).
2. `vercel.json` schedules the crons:
   - `/api/cron/deep-audit` — daily 02:30 UTC (08:00 IST)
   - `/api/cron/deep-audit-runner` — every 2 minutes
   - `/api/cron/purge-voice-audio` — daily (audio retention)
   Vercel automatically sends `Authorization: Bearer $CRON_SECRET` on cron
   invocations when the `CRON_SECRET` env var exists — set it (any long
   random string) or every cron call will 401.
3. Attach your domain; set `NEXT_PUBLIC_APP_URL=https://yourdomain.com`
   (exact, no trailing slash). This URL is baked into WhatsApp messages,
   survey links, hosted landing pages, and audit digests — localhost here is
   the most common broken-deploy symptom.

## 3. Environment variables

Set in Vercel → Project → Settings → Environment Variables (Production).

### Required — the app breaks or key features fail without these

| Variable | Used for |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client (browser + server) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client (RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only: admin panel, crons, storage writes |
| `NEXT_PUBLIC_APP_URL` | Absolute links in WhatsApp msgs / surveys / digests |
| `ANTHROPIC_API_KEY` | ALL content generation, captions, audit synthesis, chatbot, voice-note extraction |
| `CRON_SECRET` | Bearer token guarding the three cron routes |
| `SERPER_API_KEY` | Map Rank grid scans, Deep Audit discovery + AI-visibility searches |
| `SERP_PROVIDER` | **Set `serper` explicitly.** ⚠ The code DEFAULT is `mock` — deterministic FAKE rankings with no error. Unset in production = fabricated rank data shown to paying clinics. |
| `GOOGLE_MAPS_API_KEY` | Places details in Deep Audit (Text Search + Details enabled) |
| `OPENROUTER_API_KEY` | Deep Audit stage 4 (Perplexity/ChatGPT visibility queries) |
| `CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY` | Payments (plans, packs) |
| `CASHFREE_ENV` | **Set `production` explicitly** — defaults to SANDBOX otherwise (orders silently go to the wrong environment) |

### Optional — feature-gated or defaulted

| Variable | Default / effect |
|---|---|
| `GEMINI_API_KEY` | Deep Audit Gemini engine (skipped gracefully if unset) |
| `PAGESPEED_API_KEY` | Deep Audit website stage — works keyless at low quota; set for reliability |
| `RESEND_API_KEY` / `RESEND_FROM` | Welcome email (warn-and-skip if unset) |
| `GROQ_API_KEY` | Voice-note transcription (needed only if voice notes are on) |
| `ENABLE_VOICE_NOTES` | Kill switch — **default is ON**; per-clinic flags still gate the UI |
| `ENABLE_MULTI_VERTICAL` | **Keep `false` in production** until a paying non-dental clinic exists (CLAUDE.md rule) |
| `SERP_PROVIDER` | `serper` (default) / `serpapi` / `mock` |
| `SERPAPI_API_KEY` | Only if `SERP_PROVIDER=serpapi` |
| `SERP_MONTHLY_SCAN_CAP`, `SERP_DEBUG` | Scan budget guard / logging |
| `VOICE_NOTES_DAILY_CAP`, `DEEP_AUDIT_MONTHLY_LIMIT`, `AGENCY_MONTHLY_AUDIT_CAP` | Abuse caps (sane defaults) |
| `NOTES_AGENT_MODEL`, `AUDIT_SYNTH_MODEL`, `AUDIT_CLASSIFY_MODEL`, `AUDIT_GEMINI_MODEL`, `AUDIT_SONAR_MODEL`, `AUDIT_CHATGPT_MODEL`, `AUDIT_SYNTH_MAX_TOKENS` | Model overrides (leave unset) |

## 4. Third-party service setup

- **Cashfree**: production keys; add the webhook →
  `https://yourdomain.com/api/webhooks/cashfree` (payment confirmation flows
  through `apply_plan_purchase` / `apply_pack_purchase`).
- **Serper.dev**: fund the account (see the SERP budget note in the launch
  plan); scans are budget-guarded in-app.
- **Google Cloud**: one project with *Places API (New)* + *PageSpeed Insights
  API* enabled; restrict the key server-side by API, not referrer.
- **Anthropic**: set a monthly spend limit in the console as a backstop
  (₹85–105 per deep audit, ~₹5 per social generation are the big consumers).

## 5. Pre-deploy checklist (from the repo)

- [ ] **Delete the dev scaffolding** (dev-only guarded, but don't ship it):
      `app/api/dev/` (all routes), `scripts/inspect-run.mjs`, and the
      `/api/dev` exemption in `middleware.ts`.
- [ ] `npm test` green (99 tests) and `npx tsc --noEmit` clean.
- [ ] `npm run build` locally once (never while `next dev` is running — they
      share `.next/`).
- [ ] Migrations 001–043 applied; `select * from applied_migrations` shows 043.
- [ ] In `/admin` (as super-admin): confirm plan prices (Growth ₹2,499),
      pack prices, and that your own account has `is_super_admin`.

## 6. Post-deploy smoke test (15 minutes)

1. Sign up a fresh test clinic → trial starts, 50 content credits visible.
2. Settings → fill clinic info **including the Google review link**.
3. Generate one piece of content (credits decrement) and one Social post
   (image renders, approval → publish screen works).
4. Map Rank: one scan on a real keyword (heatmap renders).
5. Deep Audit: run the included audit end-to-end (~8 min) → report + 30-day
   plan appear.
6. Crons: `curl -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/deep-audit`
   → `{"ok":true,...}`; without the header → 401. Check Vercel → Crons shows
   all three green after their first scheduled run.
7. Cashfree sandbox → production: one ₹1-style test purchase → credits granted
   (webhook working).
8. Phone check: open the app on Android Chrome — sidebar collapses to
   hamburger, tap targets comfortable, wa.me buttons open WhatsApp.

## 7. Operational notes

- **Costs per active clinic/month (full usage):** ≈ ₹500 content + ₹100 audit
  + ₹200–300 maps ≈ ₹800–900 against ₹2,499 revenue (~65% floor margin).
- **Logs**: Vercel function logs are the first stop (every catch logs
  server-side); Supabase logs cover RLS/storage denials.
- **Backups**: Supabase Pro does daily backups; before risky SQL, take a
  manual snapshot.
- **Model pinning**: generation uses `claude-sonnet-4-6` (hardcoded default);
  audit stages have env overrides if a model is deprecated.
