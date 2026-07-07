-- ============================================================
-- GrowthOS — migration 035: Competitor Deep Audit engine
--
-- Ports the proprietary 6-MOAT audit framework from Airtable into Postgres. This
-- is the schema + seed only; the collection/scoring pipeline lives in app code
-- (server-side, service-role for the heavy stages that call Places/PageSpeed/
-- LLM APIs and write competitor rows across entities).
--
-- Shape:
--   * GLOBAL catalog (no clinic_id): moat_config, metric_definitions.
--     Global-READ to any authenticated user; WRITE gated on is_super_admin()
--     (defense-in-depth) — same posture as the /admin catalog. The service role
--     (admin handlers) bypasses RLS to curate.
--   * CLINIC-scoped run data: audit_runs, audit_entities, audit_signals,
--     moat_scores, audit_summaries, audit_plans, plan_items. Every one carries
--     clinic_id (CLAUDE.md rule 1 — every table has clinic_id; every query
--     filters it) and is RLS'd on clinic_id = current_clinic_id(), exactly like
--     rank_scans (007). The engine writes signals/scores/summaries/plans via the
--     service role, so clients are read-only there; the one client write is
--     plan_items.(status, done_at) — a column-locked UPDATE so staff can tick a
--     day's action done/skipped (mirrors 019's clinics column-lock).
--
-- VERTICAL: metric_definitions carries a nullable `vertical` (dental = NULL, the
-- shared pool) so a niche's website_llm rubric can diverge without a code fork
-- (CLAUDE.md vertical rules + resolveForVertical). moat_config stays global —
-- the six moats and their weights are universal.
--
-- FRAMEWORK IS FIXED: the six moats, their weights, max scores, and the metric
-- set below are the spec — not to be re-derived. Metric→moat mapping and the
-- website_llm rubrics are editable data (seeded here, curatable from /admin).
--
-- Additive + idempotent: create-if-not-exists, on-conflict upsert seeds,
-- drop-policy-if-exists before create. Requires 001 (clinics, current_clinic_id),
-- 018/019 (is_super_admin, clinics column-lock), 031 (applied_migrations).
-- Run in the Supabase SQL editor, then: notify pgrst, 'reload schema';
-- ============================================================

-- ============================================================================
-- 1. moat_config — the six MOATs (GLOBAL, admin-writable, authenticated-read).
--    weight_pct sums to 100; max_score is 100 for all six (per Airtable config).
-- ============================================================================
create table if not exists moat_config (
  id           uuid primary key default gen_random_uuid(),
  moat_key     text not null unique,
  display_name text not null,
  weight_pct   numeric not null,
  max_score    numeric not null,
  is_active    boolean not null default true,
  version      integer not null default 1
);

alter table moat_config enable row level security;
alter table moat_config force row level security;

-- Global read for any signed-in user; write only for super-admins (the service
-- role bypasses RLS for admin curation).
drop policy if exists moat_config_select on moat_config;
create policy moat_config_select on moat_config for select to authenticated
  using (true);
drop policy if exists moat_config_insert on moat_config;
create policy moat_config_insert on moat_config for insert to authenticated
  with check (is_super_admin());
drop policy if exists moat_config_update on moat_config;
create policy moat_config_update on moat_config for update to authenticated
  using (is_super_admin()) with check (is_super_admin());
drop policy if exists moat_config_delete on moat_config;
create policy moat_config_delete on moat_config for delete to authenticated
  using (is_super_admin());

insert into moat_config (moat_key, display_name, weight_pct, max_score) values
  ('ai_aeo_readiness',     'AI / AEO Readiness',    25, 100),
  ('trust_safety',         'Trust & Safety',        20, 100),
  ('local_seo_integrity',  'Local SEO Integrity',   20, 100),
  ('conversion',           'Conversion',            15, 100),
  ('operational_velocity', 'Operational Velocity',  10, 100),
  ('market_activity',      'Market Activity',       10, 100)
on conflict (moat_key) do update set
  display_name = excluded.display_name,
  weight_pct   = excluded.weight_pct,
  max_score    = excluded.max_score,
  is_active    = excluded.is_active;

-- ============================================================================
-- 2. metric_definitions — the v1 signal set (GLOBAL, admin-writable, auth-read).
--    vertical NULL = shared pool (dental stored as NULL). rubric is populated
--    ONLY for website_llm metrics and doubles as the Claude classification prompt.
-- ============================================================================
create table if not exists metric_definitions (
  id           uuid primary key default gen_random_uuid(),
  metric_key   text not null unique,
  display_name text not null,
  moat_key     text not null references moat_config (moat_key) on delete restrict,
  source       text not null check (source in
                 ('grid','places','pagespeed','website_llm','ai_citations','manual')),
  value_type   text not null check (value_type in ('number','boolean','enum','text')),
  enum_options jsonb,
  rubric       text,
  vertical     text,       -- NULL = applies to all verticals (dental lives here)
  is_active    boolean not null default true
);

create index if not exists idx_metric_defs_moat     on metric_definitions (moat_key);
create index if not exists idx_metric_defs_vertical on metric_definitions (vertical);

alter table metric_definitions enable row level security;
alter table metric_definitions force row level security;

drop policy if exists metric_defs_select on metric_definitions;
create policy metric_defs_select on metric_definitions for select to authenticated
  using (true);
drop policy if exists metric_defs_insert on metric_definitions;
create policy metric_defs_insert on metric_definitions for insert to authenticated
  with check (is_super_admin());
drop policy if exists metric_defs_update on metric_definitions;
create policy metric_defs_update on metric_definitions for update to authenticated
  using (is_super_admin()) with check (is_super_admin());
drop policy if exists metric_defs_delete on metric_definitions;
create policy metric_defs_delete on metric_definitions for delete to authenticated
  using (is_super_admin());

-- Seed: spec set + the extra metrics the real formulas reference. Metrics with no
-- API source are 'manual' (blank-tolerated). vertical NULL = shared/dental pool.
insert into metric_definitions
  (metric_key, display_name, moat_key, source, value_type, enum_options, rubric)
values
  -- ---- AI / AEO Readiness ----
  ('aio_cited',            'Google AI Overview Cited', 'ai_aeo_readiness', 'ai_citations', 'boolean', null, null),
  ('perplexity_cited',     'Perplexity Cited',         'ai_aeo_readiness', 'ai_citations', 'boolean', null, null),
  ('chatgpt_mentioned',    'ChatGPT Mentioned',        'ai_aeo_readiness', 'ai_citations', 'boolean', null, null),
  ('gemini_mentioned',     'Gemini Mentioned',         'ai_aeo_readiness', 'ai_citations', 'boolean', null, null),
  ('faq_on_website',       'FAQ Section on Website',   'ai_aeo_readiness', 'website_llm',  'boolean', null,
    'True if the website has a dedicated FAQ section or clearly structured question-and-answer content an AI answer engine could extract; false otherwise.'),
  ('schema_markup_type',   'Schema Markup Type',       'ai_aeo_readiness', 'website_llm',  'enum',
    '["None","Organization","LocalBusiness","MedicalBusiness","Dentist","FAQPage","Multiple"]'::jsonb,
    'Identify the most specific schema.org structured-data type in the page markup. "Multiple" if several relevant types coexist; "None" if no JSON-LD/microdata is found.'),
  ('chatbot_present',      'Website Chatbot Present',  'ai_aeo_readiness', 'website_llm',  'boolean', null,
    'True if the site embeds a live-chat or chatbot widget (WhatsApp bubble, Intercom, Tawk, custom bot, etc.); false if none.'),

  -- ---- Trust & Safety ----
  ('avg_google_rating',    'Average Google Rating',    'trust_safety', 'places',      'number',  null, null),
  ('total_google_reviews', 'Total Google Reviews',     'trust_safety', 'places',      'number',  null, null),
  ('review_reply_pct',     'Review Reply Rate %',      'trust_safety', 'places',      'number',  null, null),
  ('https_ssl',            'HTTPS / SSL Secure',       'trust_safety', 'pagespeed',   'boolean', null, null),
  ('trust_signals_present','Trust Signals Present',    'trust_safety', 'website_llm', 'boolean', null,
    'True if the site surfaces credibility signals — doctor credentials/registration numbers, awards, certifications, associations, or named patient testimonials; false if none are visible.'),
  ('practo_rating',        'Practo Rating',            'trust_safety', 'manual',      'number',  null, null),
  ('justdial_rating',      'JustDial Rating',          'trust_safety', 'manual',      'number',  null, null),

  -- ---- Local SEO Integrity ----
  ('primary_gbp_category', 'Primary GBP Category',     'local_seo_integrity', 'places',      'text',    null, null),
  ('secondary_categories', 'Secondary GBP Categories', 'local_seo_integrity', 'places',      'text',    null, null),
  ('category_count',       'GBP Category Count',       'local_seo_integrity', 'places',      'number',  null, null),
  ('gbp_name_violation',   'GBP Name Violation',       'local_seo_integrity', 'website_llm', 'enum',
    '["None","Mild","Moderate","Severe"]'::jsonb,
    'None = clean legal business name. Mild = name + one descriptor e.g. "Best". Moderate = descriptor + location, real name weakened. Severe = pipe-separated keyword dump or location+services stuffing.'),
  ('keywords_in_gbp_services','Keyword-Stuffed GBP Services','local_seo_integrity','website_llm','boolean', null,
    'True if the GBP services/description stuff marketing keywords or locations instead of plain service names; false if services are named cleanly.'),
  ('agrp',                 'Average Grid Rank Position','local_seo_integrity', 'grid', 'number', null, null),
  ('green_pins',           'Green Grid Pins (Top 3)',  'local_seo_integrity', 'grid', 'number', null, null),
  ('yellow_pins',          'Yellow Grid Pins (4-10)',  'local_seo_integrity', 'grid', 'number', null, null),
  ('red_pins',             'Red Grid Pins (11-20)',    'local_seo_integrity', 'grid', 'number', null, null),
  ('out_pins',             'Out-of-Ranking Grid Pins', 'local_seo_integrity', 'grid', 'number', null, null),
  ('total_pins',           'Total Grid Pins',          'local_seo_integrity', 'grid', 'number', null, null),
  ('rank_spread',          'Grid Rank Spread',         'local_seo_integrity', 'grid', 'number', null, null),
  ('nap_consistency',      'NAP Consistency',          'local_seo_integrity', 'manual', 'enum',
    '["Consistent","Minor Issues","Inconsistent"]'::jsonb, null),
  ('hindi_search_rank',    'Hindi / Vernacular Search Rank','local_seo_integrity','manual','number', null, null),
  ('practitioner_gbp_listing','Practitioner GBP Listing','local_seo_integrity','manual','boolean', null, null),
  ('knowledge_panel_status','Knowledge Panel Status',  'local_seo_integrity', 'manual', 'enum',
    '["Present","Partial","Absent"]'::jsonb, null),
  ('best_of_list_presence','"Best-of" List Presence',  'local_seo_integrity', 'manual', 'boolean', null, null),
  ('total_directory_count','Total Directory Listings', 'local_seo_integrity', 'manual', 'number',  null, null),

  -- ---- Conversion ----
  ('booking_link_present', 'Booking Link on GBP',      'conversion', 'places',      'boolean', null, null),
  ('photo_count',          'GBP Photo Count',          'conversion', 'places',      'number',  null, null),
  ('whatsapp_cta',         'WhatsApp CTA Present',      'conversion', 'website_llm', 'boolean', null,
    'True if the website offers a WhatsApp click-to-chat CTA (wa.me link or WhatsApp button); false otherwise.'),
  ('high_ticket_services_listed','High-Ticket Services Listed','conversion','website_llm','boolean', null,
    'True if the site clearly lists high-value services (implants, aligners, full-mouth rehab, cosmetic procedures, etc.) that drive premium revenue; false if only generic services are shown.'),
  ('click_to_call_works',  'Click-to-Call Works',      'conversion', 'website_llm', 'boolean', null,
    'True if the site exposes a tappable tel: phone link/button reachable within one tap on mobile; false if the number is not clickable or absent.'),
  ('appointment_booking_method','Appointment Booking Method','conversion','website_llm','enum',
    '["Online","WhatsApp","Phone Only","Third-Party","None"]'::jsonb,
    'Classify the primary booking path: "Online" = native form/scheduler; "WhatsApp" = WhatsApp-first; "Phone Only" = call only; "Third-Party" = Practo/other portal; "None" = no booking path.'),

  -- ---- Operational Velocity ----
  ('business_hours_complete','GBP Business Hours Complete','operational_velocity','places','boolean', null, null),
  ('gbp_post_recency',     'Days Since Last GBP Post', 'operational_velocity', 'manual',    'number', null, null),
  ('post_frequency_3mo',   'GBP Posts (Last 3 Months)','operational_velocity', 'manual',    'number', null, null),
  ('pagespeed_mobile',     'PageSpeed Mobile Score',   'operational_velocity', 'pagespeed', 'number', null, null),
  ('core_web_vitals_pass', 'Core Web Vitals',          'operational_velocity', 'pagespeed', 'enum',
    '["Pass","Fail"]'::jsonb, null),
  ('mobile_speed',         'Mobile Speed Band',        'operational_velocity', 'pagespeed', 'enum',
    '["Fast","Average","Slow"]'::jsonb, null),

  -- ---- Market Activity ----
  ('blog_post_count',      'Blog Post Count',          'market_activity', 'website_llm', 'number', null,
    'Count the distinct blog/article posts published on the site. Use 0 if there is no blog.'),
  ('instagram_followers',  'Instagram Followers',      'market_activity', 'manual',      'number', null, null),
  ('review_velocity_manual','Review Velocity (Manual)','market_activity', 'manual',      'number', null, null)
on conflict (metric_key) do update set
  display_name = excluded.display_name,
  moat_key     = excluded.moat_key,
  source       = excluded.source,
  value_type   = excluded.value_type,
  enum_options = excluded.enum_options,
  rubric       = excluded.rubric,
  is_active    = excluded.is_active;

-- ============================================================================
-- 3. clinics — market inputs for the leakage math (per clinic, blank-tolerated).
--    From city keyword data; revenue-loss numbers only render when present.
--    019 revoked blanket UPDATE on clinics and re-granted an allow-list — these
--    three are user-editable from settings, so add them to the grant. (If a new
--    user-editable clinic column is added later, add it to 019's allow-list too.)
-- ============================================================================
alter table clinics add column if not exists market_monthly_search_volume integer;
alter table clinics add column if not exists market_avg_patient_value_inr  numeric;
alter table clinics add column if not exists market_ltv_multiplier         numeric;

grant update (market_monthly_search_volume, market_avg_patient_value_inr, market_ltv_multiplier)
  on clinics to authenticated;

-- ============================================================================
-- 4. audit_runs — one deep-audit job (clinic-scoped). Status walks the pipeline.
--    Client may create + read its own runs; stage transitions are written by the
--    engine (service role), so no client UPDATE/DELETE policy.
-- ============================================================================
create table if not exists audit_runs (
  id                  uuid primary key default gen_random_uuid(),
  clinic_id           uuid not null references clinics (id) on delete restrict,
  created_at          timestamptz not null default now(),
  status              text not null default 'queued' check (status in
                        ('queued','discovering','collecting','ai_queries',
                         'scoring','synthesizing','complete','failed')),
  stage_detail        text,
  competitor_place_ids text[],
  credits_spent       integer not null default 0,
  error               text,
  completed_at        timestamptz
);

create index if not exists idx_audit_runs_clinic on audit_runs (clinic_id, created_at desc);

alter table audit_runs enable row level security;
alter table audit_runs force row level security;
drop policy if exists audit_runs_select on audit_runs;
create policy audit_runs_select on audit_runs for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists audit_runs_insert on audit_runs;
create policy audit_runs_insert on audit_runs for insert to authenticated
  with check (clinic_id = current_clinic_id());

-- ============================================================================
-- 5. audit_entities — the clinic ('self') and each competitor, per run.
--    Populated by the engine (service role); clients read-only.
-- ============================================================================
create table if not exists audit_entities (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references audit_runs (id) on delete cascade,
  clinic_id    uuid not null references clinics (id) on delete restrict,
  entity_kind  text not null check (entity_kind in ('self','competitor')),
  place_id     text,
  display_name text,
  gbp_url      text,
  website_url  text
);

create index if not exists idx_audit_entities_run    on audit_entities (run_id);
create index if not exists idx_audit_entities_clinic on audit_entities (clinic_id);

alter table audit_entities enable row level security;
alter table audit_entities force row level security;
drop policy if exists audit_entities_select on audit_entities;
create policy audit_entities_select on audit_entities for select to authenticated
  using (clinic_id = current_clinic_id());

-- ============================================================================
-- 6. audit_signals — one RAW measurement per metric per entity per run.
--    Exactly one of value_number/value_bool/value_text is meaningful (per the
--    metric's value_type). Populated by the engine (service role); read-only.
-- ============================================================================
create table if not exists audit_signals (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid not null references audit_runs (id) on delete cascade,
  entity_id    uuid not null references audit_entities (id) on delete cascade,
  clinic_id    uuid not null references clinics (id) on delete restrict,
  metric_key   text not null references metric_definitions (metric_key) on delete restrict,
  value_number numeric,
  value_bool   boolean,
  value_text   text,
  source       text not null check (source in
                 ('grid','places','pagespeed','website_llm','ai_citations','manual')),
  fetched_at   timestamptz not null default now(),
  raw_meta     jsonb
);

create index if not exists idx_audit_signals_run    on audit_signals (run_id);
create index if not exists idx_audit_signals_entity on audit_signals (entity_id);
create index if not exists idx_audit_signals_clinic on audit_signals (clinic_id);
create index if not exists idx_audit_signals_metric on audit_signals (metric_key);

alter table audit_signals enable row level security;
alter table audit_signals force row level security;
drop policy if exists audit_signals_select on audit_signals;
create policy audit_signals_select on audit_signals for select to authenticated
  using (clinic_id = current_clinic_id());

-- ============================================================================
-- 7. moat_scores — COMPUTED per moat per entity per run (never hand-written).
--    The internal prioritization layer; shown to the clinic only as a secondary
--    "how we calculated" view. Written by the engine (service role); read-only.
-- ============================================================================
create table if not exists moat_scores (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references audit_runs (id) on delete cascade,
  entity_id       uuid not null references audit_entities (id) on delete cascade,
  clinic_id       uuid not null references clinics (id) on delete restrict,
  moat_key        text not null references moat_config (moat_key) on delete restrict,
  score           numeric,
  max_score       numeric,
  signals_measured integer,
  signals_total   integer,
  config_version  integer
);

create index if not exists idx_moat_scores_run    on moat_scores (run_id);
create index if not exists idx_moat_scores_entity on moat_scores (entity_id);
create index if not exists idx_moat_scores_clinic on moat_scores (clinic_id);

alter table moat_scores enable row level security;
alter table moat_scores force row level security;
drop policy if exists moat_scores_select on moat_scores;
create policy moat_scores_select on moat_scores for select to authenticated
  using (clinic_id = current_clinic_id());

-- ============================================================================
-- 8. audit_summaries — rolled-up score + leakage math per entity per run.
--    synthesis (Stage 6 output) is populated for the 'self' entity only.
--    Written by the engine (service role); read-only.
-- ============================================================================
create table if not exists audit_summaries (
  id                        uuid primary key default gen_random_uuid(),
  run_id                    uuid not null references audit_runs (id) on delete cascade,
  entity_id                 uuid not null references audit_entities (id) on delete cascade,
  clinic_id                 uuid not null references clinics (id) on delete restrict,
  average_digital_score     numeric,
  score_band                text,
  expected_market_share_pct numeric,
  revenue_loss_month        numeric,
  annual_revenue_loss       numeric,
  synthesis                 jsonb
);

create index if not exists idx_audit_summaries_run    on audit_summaries (run_id);
create index if not exists idx_audit_summaries_entity on audit_summaries (entity_id);
create index if not exists idx_audit_summaries_clinic on audit_summaries (clinic_id);

alter table audit_summaries enable row level security;
alter table audit_summaries force row level security;
drop policy if exists audit_summaries_select on audit_summaries;
create policy audit_summaries_select on audit_summaries for select to authenticated
  using (clinic_id = current_clinic_id());

-- ============================================================================
-- 9. audit_plans — the 15-day action plan (one per run). When a new audit runs,
--    the previous plan flips to 'superseded' (its item done/skipped stats are
--    kept for the delta digest). Written by the engine (service role); read-only.
-- ============================================================================
create table if not exists audit_plans (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null unique references audit_runs (id) on delete cascade,
  clinic_id  uuid not null references clinics (id) on delete restrict,
  created_at timestamptz not null default now(),
  title      text,
  summary    text,
  status     text not null default 'active' check (status in ('active','completed','superseded'))
);

create index if not exists idx_audit_plans_clinic on audit_plans (clinic_id, created_at desc);

alter table audit_plans enable row level security;
alter table audit_plans force row level security;
drop policy if exists audit_plans_select on audit_plans;
create policy audit_plans_select on audit_plans for select to authenticated
  using (clinic_id = current_clinic_id());

-- ============================================================================
-- 10. plan_items — the tracked day-by-day actions. The one CLIENT write in this
--     module: staff mark an item done/skipped from the UI. RLS scopes the row to
--     the clinic; a column-lock (mirroring 019) limits the writable columns to
--     (status, done_at) so the body of the plan stays engine-owned.
-- ============================================================================
create table if not exists plan_items (
  id                 uuid primary key default gen_random_uuid(),
  plan_id            uuid not null references audit_plans (id) on delete cascade,
  clinic_id          uuid not null references clinics (id) on delete restrict,
  day_number         integer not null check (day_number between 1 and 15),
  title              text,
  description        text,
  evidence           text,
  metric_keys        text[],
  competitor_context text,
  effort             text check (effort in ('15-min','1-hour','needs-help')),
  status             text not null default 'pending' check (status in ('pending','done','skipped')),
  done_at            timestamptz
);

create index if not exists idx_plan_items_plan   on plan_items (plan_id, day_number);
create index if not exists idx_plan_items_clinic on plan_items (clinic_id);

alter table plan_items enable row level security;
alter table plan_items force row level security;
drop policy if exists plan_items_select on plan_items;
create policy plan_items_select on plan_items for select to authenticated
  using (clinic_id = current_clinic_id());
-- The clinic may progress its own items; column-lock (below) restricts WHICH
-- columns actually change to (status, done_at).
drop policy if exists plan_items_update on plan_items;
create policy plan_items_update on plan_items for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());

revoke update on plan_items from authenticated;
grant update (status, done_at) on plan_items to authenticated;

-- ============================================================================
-- 11. Register this migration.
-- ============================================================================
insert into applied_migrations (version, name) values
  ('035','deep_audit_engine')
on conflict (version) do nothing;
