# HANDOFF — Deep Audit engine: Stages 1–4 built & tested (Stages 5–6 next)

Branch: `vertical-config` · Read `CLAUDE.md` first. All work below is **local /
uncommitted** on `vertical-config` (same as the payments work before it).

The Deep Audit is a competitor online-presence audit that scores a clinic vs its
top local rivals across a 6-MOAT framework. This session built the **collection
pipeline, Stages 1–4** (identity + competitors → GBP → website → AI visibility),
metered per clinic, and tested it end-to-end on a real clinic. **Stages 5–6
(scoring → synthesis) are the next build.**

---

## 0. Migrations to apply (Supabase SQL editor, in order)

DDL can't run via the service role. After each: `notify pgrst, 'reload schema';`

- **`035_deep_audit_engine.sql`** — the schema: `moat_config` (6 MOATs, seeded),
  `metric_definitions` (47 metrics, seeded, nullable `vertical`), clinic-scoped
  `audit_runs / audit_entities / audit_signals / moat_scores / audit_summaries /
  audit_plans / plan_items`, + `clinics` market columns. ✅ applied
- **`036_deep_audit_metering.sql`** — per-cycle allowance counter
  (`clinics.deep_audits_used_this_cycle`, default cap 2), `start_deep_audit` /
  `release_deep_audit` RPCs, `audit_runs.stage_cursor / est_api_cost_inr /
  slot_released`, `credit_ledger` reason `audit_deep`, seed
  `review_velocity_computed`. ✅ applied
- **`037_ai_query_results.sql`** — Stage 4: `ai_query_results` (clinic-scoped) +
  seeds `ai_citation_rate / best_ai_layer / ai_mentions_count`. ✅ applied

A fresh deployment must re-apply **035 → 036 → 037** (after 030–034). Next
migration number is **038**.

---

## 1. Architecture — how a run works

**Billing (NOT shared map credits):** each clinic gets a per-cycle allowance
(default 2, `DEEP_AUDIT_MONTHLY_LIMIT`). `start_deep_audit` atomically consumes a
slot (row-locked) and writes a **delta-0 `audit_deep` credit_ledger row** for
cost attribution. Rolling monthly window resets 1 month after the cycle's first
audit (TODO: re-anchor to `current_period_end` when the gateway is live).
"Buy extra audit (₹1,000)" is a later step. A **discover-stage failure** refunds
the slot (`release_deep_audit`); later-stage failures keep the slot (the run is
retryable for free).

**Orchestration:** a state machine over `audit_runs.status`, driven by the
`runAuditStage` server action — **one stage per call, resumable via
`stage_cursor`** (`lib/audit/run.ts`). Each stage is **idempotent** (clears its
own rows first) so a retry re-runs only the failed stage. `est_api_cost_inr`
accumulates for margin tracking (A3).

```
STAGES = discover → gbp → web → ai_queries  [→ scoring → synthesize  (Stages 5–6, TODO)]
status:  discovering  collecting  collecting  ai_queries
```

**Stage 1 — discover** (`lib/audit/stages/discover.ts`): identity sourced
**entirely from Settings** (`clinics`: business_name, city, area, website_url,
`default_lat/lng`). Reuses the latest grid scan if <30d, else runs a chargeless
`executeGridScan`. Picks the top-3 most-frequent top-3 occupants, resolves each
(and self) to a Google `place_id` via Places Text Search + the O1/O2 canonical
matcher. Writes 1 self + ≤3 competitor `audit_entities`. **The Rank Tracker
keyword is optional** — used only to reuse its scan params / stored place_id;
absent, the keyword is derived from the Settings locale and the place_id from the
Settings name+coords.

**Stage 2 — gbp** (`gbp.ts`): Places Details (New API, explicit field mask) → one
`audit_signals` row per places metric, `raw_meta` holds the payload fragment.
Enriches entities with website/GBP URLs. Computes `review_velocity_computed` vs
the prior completed run (silent on run #1).

**Stage 3 — web** (`web.ts`): PageSpeed mobile (`pagespeed_mobile`,
`core_web_vitals_pass`, `https_ssl`) + **one Claude call per entity** classifying
all `website_llm` metrics against their rubrics (evidence stored per signal).
A failed/slow site records nulls with `raw_meta.error`, never crashes the run.

**Stage 4 — ai_queries** (`ai_queries.ts`): the L1–L6 AI-visibility framework.

---

## 2. Stage 4 detail (AI visibility)

**Queries — 6 per run (1 per layer)**, locale from Settings, treatment from the
clinic's `rate_cards` (else a dental default):

| Layer | Template |
|---|---|
| L1 Discovery | `best dental clinics in {area}, {city}` |
| L2 Procedure | `{treatment} cost in {area}, {city}` |
| L3 Trust | `most trusted dentist in {area}` |
| L4 Comparison | `top 5 dentists in {city}` |
| L5 Emergency | `emergency dentist near {area}` |
| L6 Educational | `{treatment} kaise hota hai` (Hindi) |

**Engines** (`lib/audit/engines/*`, provider-agnostic like the billing seam;
skip-if-key-absent, logged, never fail the run):
- **gemini** — direct Google API with **Google Search grounding** (grounded
  source URLs). Must stay on the direct key: OpenRouter can't do Google's native
  grounding.
- **perplexity** (`perplexity/sonar`) + **chatgpt** (`openai/gpt-4o-mini`) — both
  via **OpenRouter** on one `OPENROUTER_API_KEY`. `max_tokens` is capped
  (`AI_ENGINE_MAX_TOKENS=1200`) — see §3.
- **google_aio** — Serper `/search`. **Verified: Serper does NOT return AI
  Overviews** on our account (empirically absent on Kota queries Google shows no
  AIO for → a correct negative). It reports `present:false` and never fakes a
  citation. For real AIO coverage later, SerpApi's `google_ai_overview` endpoint
  slots behind the same `AiEngine` interface.

**Pipeline:** sequential calls with a polite delay + a 429 backoff → **one Claude
parse call per engine batch** (guarded: a parse failure degrades that engine, not
the run) → `ai_query_results` rows → rollups to `audit_signals`:
per-engine cited booleans, `ai_citation_rate` %, `best_ai_layer`, per-entity
`ai_mentions_count`, and the **Source Intelligence** domain map in
`raw_meta.source_intelligence` (replaces the Airtable table).

---

## 3. Two bugs fixed this session (don't reintroduce)

1. **Next.js caches Supabase `SELECT`s.** Supabase reads are HTTP GETs, which
   Next caches by default — the pipeline re-reading a run between stages got a
   stale snapshot and looped Stage 1 forever. Fixed by forcing `cache:'no-store'`
   on the admin client (`lib/supabase/admin.ts`) and reloading the run through it
   in `runAuditStage`. **Any new server-side re-read of mutating data must be
   no-store.**
2. **OpenRouter reserves credits against a model's MAX context.** With no
   `max_tokens`, Sonar demanded ~65k tokens' worth of balance → HTTP 402, silently
   empty. Fixed by capping `max_tokens` and by detecting OpenRouter's
   200-with-`{error}` bodies (`lib/audit/engines/openrouter.ts`).

---

## 4. Live test — Dr. Mahima's Dental Care (Kota), full Stages 1–4

Run `beccc98f…`. Identity resolved **from Settings**: *Dr. Mahima's Dental Care*,
place_id `ChIJNSr8…`, site `drmahimasdentalcare.in`. Cost est ₹69.4.

- Stages 1–3: 3 competitors, GBP + website signals (rating 4.9 / 130 reviews,
  clean GBP name "None", "Online" booking, implant pricing ₹15,000 — all matched
  reality in the earlier eyeball).
- **Stage 4: self-cited 4/24** — **Perplexity** cited the clinic on **L1, L2, L3,
  L5** (genuine, non-name-embedding discovery queries). `ai_citation_rate` 16.7%,
  `best_ai_layer` L1.
- **Source Intelligence** (which domains AI trusts for Kota dental): `justdial.com`
  (21) ≫ `drmahimasdentalcare.in` (5), `youtube.com` (5), `practo.com` (4),
  `lybrate.com` (4), `kotaonline.in` (2), … — directories dominate.

---

## 5. Known issues / decisions

- **Gemini free-tier 429s.** A 6-query burst throttles; there's a 2-retry
  backoff, but on the free tier Gemini often returns 0. Fix = upgrade the
  **Google** key to a paid tier (stays direct → keeps grounding). Do NOT move
  Gemini to OpenRouter (loses grounding).
- **ChatGPT (gpt-4o-mini) has no web** — it won't know a small clinic, so
  self-cited 0 is expected. It's a useful "does the base model know you at all"
  signal, not a discovery signal.
- **Name-embedding queries inflate self_cited.** L3/L4 that contain the clinic
  name make any model trivially "mention" it. The current L3/L4 avoid this on
  purpose (`most trusted dentist…`, `top 5 dentists…`). Stage 5 scoring should
  still weight non-name queries higher.
- **OpenRouter payment:** a $5 top-up debited the user's bank but never landed on
  the account (API shows `total_credits: 0`); likely an uncaptured
  authorization/refund. Our real usage is ~$0.02. Not a code issue.

---

## 6. Key files
- Orchestrator: `lib/audit/run.ts` · Server actions: `app/(app)/audit/actions.ts`
- Stages: `lib/audit/stages/{discover,gbp,web,ai_queries}.ts`
- Engines: `lib/audit/engines/{types,gemini,openrouter,google_aio,index}.ts`
- Query gen: `lib/audit/queries.ts` · Citation parse: `lib/audit/parse-citations.ts`
- Clients: `lib/places/client.ts`, `lib/pagespeed/client.ts`,
  `lib/audit/website.ts`, `lib/audit/classify.ts`
- Config/types: `lib/audit/{config,types}.ts` · Scan core: `lib/serp/scan.ts`
- Migrations: `supabase/migrations/03{5,6,7}_*.sql`

## 7. Env keys (all server-only)
`GOOGLE_MAPS_API_KEY`, `PAGESPEED_API_KEY`, `ANTHROPIC_API_KEY`, `SERPER_API_KEY`,
`GEMINI_API_KEY`, `OPENROUTER_API_KEY`. Overrides: `DEEP_AUDIT_MONTHLY_LIMIT`,
`AUDIT_GEMINI_MODEL`, `AUDIT_SONAR_MODEL`, `AUDIT_CHATGPT_MODEL`,
`AUDIT_CLASSIFY_MODEL`.

## 8. NEXT — Stages 5–6
- **Stage 5 (scoring):** compute `moat_scores` per entity from `audit_signals`
  using `moat_config` weights + each metric's contribution; write
  `audit_summaries` (average_digital_score, band, expected_market_share,
  revenue-loss math from the `clinics.market_*` inputs). Weight non-name AI
  queries; the `moat_config`/`metric_definitions` scaffolding is already seeded.
- **Stage 6 (synthesize):** one Claude call → the 15-day `audit_plans` /
  `plan_items` deliverable (evidence-backed, Hinglish), flip the prior plan to
  `superseded`.
- Then the **UI** (`/audit`) + wiring `startDeepAudit`/`runAuditStage` to a
  poller, and the public shareable report.

**Testing note:** Stages were tested via a temporary dev route
(`app/api/dev/audit-test`, since removed) that drove `runNextStage` with the
service role. There's no `/audit` UI yet — drive `startDeepAudit()` then loop
`runAuditStage(runId)`. Several test `audit_runs` exist in the dev DB and can be
purged.
