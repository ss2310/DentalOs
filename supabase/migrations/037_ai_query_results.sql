-- ============================================================
-- GrowthOS — migration 037: Stage 4 AI-visibility (ai_query_results)
--
-- Stage 4 of the Deep Audit runs the L1–L6 query framework across AI engines
-- (Gemini w/ Google Search grounding, Perplexity Sonar + ChatGPT via OpenRouter,
-- google_aio via Serper) and records, per query per engine, whether OUR clinic
-- is cited, which competitors are cited, and the source URLs the engine trusted.
--
--   * ai_query_results: one row per (query × engine), clinic-scoped, RLS'd like
--     the other audit_* tables. Written by the engine (service role); clients
--     read-only.
--   * Rollups land in audit_signals against the existing ai_citations metrics
--     (aio_cited / perplexity_cited / chatgpt_mentioned / gemini_mentioned) plus
--     three new metrics seeded here: ai_citation_rate, best_ai_layer,
--     ai_mentions_count (the last recorded per entity, incl. competitors).
--   * "AI Source Intelligence" (which domains AI engines trust for dental in this
--     city) is aggregated into audit_signals.raw_meta — no separate table.
--
-- Additive + idempotent. Requires 001 (clinics, current_clinic_id), 035
-- (audit_runs, audit_entities, metric_definitions), 031 (applied_migrations).
-- Run in the Supabase SQL editor, then: notify pgrst, 'reload schema';
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. ai_query_results — one row per (query × engine), clinic-scoped.
-- ---------------------------------------------------------------------------
create table if not exists ai_query_results (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references audit_runs (id) on delete cascade,
  clinic_id         uuid not null references clinics (id) on delete restrict,
  layer             text not null,            -- 'L1'..'L6'
  query_text        text not null,
  engine            text not null,            -- 'gemini'|'perplexity'|'chatgpt'|'google_aio'
  self_cited        boolean not null default false,
  competitors_cited text[] not null default '{}',
  sources           jsonb,                    -- [{ url, domain, type }]
  created_at        timestamptz not null default now()
);

create index if not exists idx_ai_query_results_run    on ai_query_results (run_id);
create index if not exists idx_ai_query_results_clinic on ai_query_results (clinic_id);

alter table ai_query_results enable row level security;
alter table ai_query_results force row level security;
drop policy if exists ai_query_results_select on ai_query_results;
create policy ai_query_results_select on ai_query_results for select to authenticated
  using (clinic_id = current_clinic_id());
-- Writes are engine-only (service role, bypasses RLS). No client write policy.

-- ---------------------------------------------------------------------------
-- 2. New rollup metrics (vertical NULL = shared pool). The per-engine booleans
--    (aio_cited / perplexity_cited / chatgpt_mentioned / gemini_mentioned) were
--    already seeded in 035; these three are the aggregate signals Stage 4 adds.
-- ---------------------------------------------------------------------------
insert into metric_definitions
  (metric_key, display_name, moat_key, source, value_type, enum_options, rubric)
values
  ('ai_citation_rate', 'AI Citation Rate %',      'ai_aeo_readiness', 'ai_citations', 'number', null, null),
  ('best_ai_layer',    'Best AI Visibility Layer', 'ai_aeo_readiness', 'ai_citations', 'text',   null, null),
  ('ai_mentions_count','AI Mentions (count)',      'ai_aeo_readiness', 'ai_citations', 'number', null, null)
on conflict (metric_key) do update set
  display_name = excluded.display_name,
  moat_key     = excluded.moat_key,
  source       = excluded.source,
  value_type   = excluded.value_type,
  is_active    = excluded.is_active;

-- ---------------------------------------------------------------------------
-- 3. Register this migration.
-- ---------------------------------------------------------------------------
insert into applied_migrations (version, name) values
  ('037','ai_query_results')
on conflict (version) do nothing;
