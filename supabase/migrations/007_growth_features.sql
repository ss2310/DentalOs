-- ============================================================
-- GrowthOS — migration 007: growth features
-- Grid rank tracking, prospecting (agency-scoped), AI-visibility
-- tracking, automation rules, and hosted local landing pages.
--
-- The base schema (001) is already LIVE. This migration is ADDITIVE and
-- IDEMPOTENT: create-if-not-exists tables, add-column-if-not-exists,
-- drop-policy-if-exists before create, create-or-replace functions.
-- It reuses the existing clinic-scoping helper current_clinic_id() and
-- the survey_responses tokenized-anon pattern (SECURITY DEFINER fns).
--
-- Tenancy notes:
--   * rank_*, ai_visibility_*, automation_rules, landing_pages → CLINIC-scoped.
--   * prospect_audits → AGENCY-scoped (owner + profiles.is_agency), NOT clinic.
--   * Two public exceptions (anon) are tokenized SECURITY DEFINER functions
--     only — no anon table policies exist.
-- ============================================================

-- ------------------------------------------------------------
-- 1. COLUMN ADDITIONS (idempotent)
-- ------------------------------------------------------------

-- Agency flag: gates prospect_audits. Set manually on the agency owner's row.
alter table profiles add column if not exists is_agency boolean not null default false;

-- Clinic map centre for grid scans + booking_slug for public landing-page URLs.
alter table clinics add column if not exists default_lat numeric;
alter table clinics add column if not exists default_lng numeric;
-- booking_slug is NOT in the base schema; landing_pages' public lookup needs it.
alter table clinics add column if not exists booking_slug text;

-- Unique per non-null slug (multiple clinics may have it unset).
create unique index if not exists uq_clinics_booking_slug
  on clinics (booking_slug) where booking_slug is not null;

-- ------------------------------------------------------------
-- 2. HELPER — is the current user an agency user?
-- ------------------------------------------------------------
-- SECURITY DEFINER so it reads profiles without recursing into profiles' RLS,
-- mirroring current_clinic_id().

create or replace function is_agency()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_agency from profiles where id = auth.uid()), false);
$$;

revoke execute on function is_agency() from public, anon;
grant execute on function is_agency() to authenticated;

-- ------------------------------------------------------------
-- 3. TABLES
-- ------------------------------------------------------------

-- ---- Grid rank tracking (clinic-scoped) ----
create table if not exists rank_tracking_keywords (
  id                   uuid primary key default gen_random_uuid(),
  clinic_id            uuid not null references clinics (id) on delete restrict,
  keyword              text not null,
  target_business_name text not null,
  target_place_id      text,
  center_lat           numeric not null,
  center_lng           numeric not null,
  grid_size            integer not null default 7,
  radius_km            numeric not null default 3,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now()
);

create table if not exists rank_scans (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics (id) on delete restrict,
  keyword_id    uuid not null references rank_tracking_keywords (id) on delete cascade,
  scanned_at    timestamptz not null default now(),
  avg_rank      numeric,
  pct_in_top3   numeric,
  grid_points   jsonb,           -- array of { lat, lng, rank|null }
  provider      text,
  requests_made integer not null default 0,
  created_by    uuid references profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ---- Prospecting (AGENCY-scoped, NOT clinic-scoped) ----
create table if not exists prospect_audits (
  id                    uuid primary key default gen_random_uuid(),
  created_by            uuid not null references auth.users (id) on delete cascade,
  business_name         text,
  area                  text,
  city                  text,
  keyword               text,
  center_lat            numeric,
  center_lng            numeric,
  grid_points           jsonb,   -- array of { lat, lng, rank|null }
  avg_rank              numeric,
  pct_in_top3           numeric,
  competitors           jsonb,   -- array of { name, rank, rating, reviews_count, has_website }
  findings              jsonb,   -- array of short strings
  ai_visibility_summary jsonb,
  -- Unguessable public share handle (same spirit as survey_token).
  share_token           text not null unique default gen_random_uuid()::text,
  provider              text,
  requests_made         integer not null default 0,
  created_at            timestamptz not null default now()
);

-- ---- AI visibility tracking (clinic-scoped) ----
create table if not exists ai_visibility_queries (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics (id) on delete restrict,
  query_text  text not null,
  query_layer text,   -- 'direct_brand' | 'service_area' | 'best_of' | 'comparison' | 'symptom' | 'voice_style'
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists ai_visibility_checks (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics (id) on delete restrict,
  query_id      uuid not null references ai_visibility_queries (id) on delete cascade,
  engine        text not null,   -- 'chatgpt' | 'gemini' | 'perplexity' | 'google_ai_overview'
  checked_at    timestamptz not null default now(),
  is_cited      boolean not null default false,
  is_mentioned  boolean not null default false,
  position_note text,
  cited_sources jsonb,            -- array of source URLs / names
  raw_excerpt   text,
  checked_by    uuid references profiles (id) on delete set null,
  check_method  text not null default 'manual',  -- 'manual' | 'api'
  created_at    timestamptz not null default now()
);

-- ---- Automation rules lite (clinic-scoped) ----
create table if not exists automation_rules (
  id                    uuid primary key default gen_random_uuid(),
  clinic_id             uuid not null references clinics (id) on delete restrict,
  name                  text not null,
  trigger_type          text not null,  -- 'case_stale' | 'recall_overdue' | 'outstanding_aged' | 'noshow_unrecovered' | 'lead_stale' | 'birthday_upcoming'
  threshold_days        integer not null default 7,
  action_type           text not null default 'create_notification',
  notification_priority text not null default 'important',
  is_active             boolean not null default true,
  last_run_at           timestamptz,
  created_at            timestamptz not null default now()
);

-- ---- Hosted local landing pages (clinic-scoped) ----
create table if not exists landing_pages (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics (id) on delete restrict,
  slug              text not null,
  target_area       text,
  title             text,
  meta_description  text,
  html_content      text,
  schema_jsonld     text,
  status            text not null default 'draft',  -- 'draft' | 'published'
  published_at      timestamptz,
  source_content_id uuid references generated_content (id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (clinic_id, slug)
);

-- ------------------------------------------------------------
-- 4. INDEXES
-- ------------------------------------------------------------

create index if not exists idx_rank_keywords_clinic     on rank_tracking_keywords (clinic_id);
create index if not exists idx_rank_scans_clinic         on rank_scans (clinic_id);
create index if not exists idx_rank_scans_keyword        on rank_scans (keyword_id);
create index if not exists idx_prospect_audits_creator   on prospect_audits (created_by);
create index if not exists idx_ai_queries_clinic         on ai_visibility_queries (clinic_id);
create index if not exists idx_ai_checks_clinic          on ai_visibility_checks (clinic_id);
create index if not exists idx_ai_checks_query           on ai_visibility_checks (query_id);
create index if not exists idx_automation_rules_clinic   on automation_rules (clinic_id);
create index if not exists idx_landing_pages_clinic      on landing_pages (clinic_id);

-- ------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ------------------------------------------------------------

-- ---- rank_tracking_keywords (clinic-scoped) ----
alter table rank_tracking_keywords enable row level security;
alter table rank_tracking_keywords force row level security;
drop policy if exists rank_keywords_select on rank_tracking_keywords;
create policy rank_keywords_select on rank_tracking_keywords for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists rank_keywords_insert on rank_tracking_keywords;
create policy rank_keywords_insert on rank_tracking_keywords for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists rank_keywords_update on rank_tracking_keywords;
create policy rank_keywords_update on rank_tracking_keywords for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists rank_keywords_delete on rank_tracking_keywords;
create policy rank_keywords_delete on rank_tracking_keywords for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- rank_scans (clinic-scoped) ----
alter table rank_scans enable row level security;
alter table rank_scans force row level security;
drop policy if exists rank_scans_select on rank_scans;
create policy rank_scans_select on rank_scans for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists rank_scans_insert on rank_scans;
create policy rank_scans_insert on rank_scans for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists rank_scans_update on rank_scans;
create policy rank_scans_update on rank_scans for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists rank_scans_delete on rank_scans;
create policy rank_scans_delete on rank_scans for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- prospect_audits (AGENCY-scoped) ----
-- Owner + agency flag on both USING and WITH CHECK. The anon share exception is
-- handled solely by get_prospect_audit_by_token() below — no anon policy here.
alter table prospect_audits enable row level security;
alter table prospect_audits force row level security;
drop policy if exists prospect_audits_select on prospect_audits;
create policy prospect_audits_select on prospect_audits for select to authenticated
  using (created_by = auth.uid() and is_agency());
drop policy if exists prospect_audits_insert on prospect_audits;
create policy prospect_audits_insert on prospect_audits for insert to authenticated
  with check (created_by = auth.uid() and is_agency());
drop policy if exists prospect_audits_update on prospect_audits;
create policy prospect_audits_update on prospect_audits for update to authenticated
  using (created_by = auth.uid() and is_agency())
  with check (created_by = auth.uid() and is_agency());
drop policy if exists prospect_audits_delete on prospect_audits;
create policy prospect_audits_delete on prospect_audits for delete to authenticated
  using (created_by = auth.uid() and is_agency());

-- ---- ai_visibility_queries (clinic-scoped) ----
alter table ai_visibility_queries enable row level security;
alter table ai_visibility_queries force row level security;
drop policy if exists ai_queries_select on ai_visibility_queries;
create policy ai_queries_select on ai_visibility_queries for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists ai_queries_insert on ai_visibility_queries;
create policy ai_queries_insert on ai_visibility_queries for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists ai_queries_update on ai_visibility_queries;
create policy ai_queries_update on ai_visibility_queries for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists ai_queries_delete on ai_visibility_queries;
create policy ai_queries_delete on ai_visibility_queries for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- ai_visibility_checks (clinic-scoped) ----
alter table ai_visibility_checks enable row level security;
alter table ai_visibility_checks force row level security;
drop policy if exists ai_checks_select on ai_visibility_checks;
create policy ai_checks_select on ai_visibility_checks for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists ai_checks_insert on ai_visibility_checks;
create policy ai_checks_insert on ai_visibility_checks for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists ai_checks_update on ai_visibility_checks;
create policy ai_checks_update on ai_visibility_checks for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists ai_checks_delete on ai_visibility_checks;
create policy ai_checks_delete on ai_visibility_checks for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- automation_rules (clinic-scoped) ----
alter table automation_rules enable row level security;
alter table automation_rules force row level security;
drop policy if exists automation_rules_select on automation_rules;
create policy automation_rules_select on automation_rules for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists automation_rules_insert on automation_rules;
create policy automation_rules_insert on automation_rules for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists automation_rules_update on automation_rules;
create policy automation_rules_update on automation_rules for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists automation_rules_delete on automation_rules;
create policy automation_rules_delete on automation_rules for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- landing_pages (clinic-scoped) ----
-- Authenticated access is clinic-scoped; the anon published-page exception is
-- handled by get_published_landing_page() below — no anon policy here.
alter table landing_pages enable row level security;
alter table landing_pages force row level security;
drop policy if exists landing_pages_select on landing_pages;
create policy landing_pages_select on landing_pages for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists landing_pages_insert on landing_pages;
create policy landing_pages_insert on landing_pages for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists landing_pages_update on landing_pages;
create policy landing_pages_update on landing_pages for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists landing_pages_delete on landing_pages;
create policy landing_pages_delete on landing_pages for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ------------------------------------------------------------
-- 6. PUBLIC (ANON) TOKENIZED READS — SECURITY DEFINER
-- ------------------------------------------------------------
-- Both tables stay fully locked under RLS. These functions are the ONLY anon
-- entry points, each returning exactly the row(s) matched by an unguessable
-- handle, and never expose owner/user ids.

-- Prospect audit by share_token (single row).
create or replace function get_prospect_audit_by_token(p_token text)
returns table (
  business_name         text,
  area                  text,
  city                  text,
  keyword               text,
  center_lat            numeric,
  center_lng            numeric,
  grid_points           jsonb,
  avg_rank              numeric,
  pct_in_top3           numeric,
  competitors           jsonb,
  findings              jsonb,
  ai_visibility_summary jsonb,
  created_at            timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.business_name, p.area, p.city, p.keyword, p.center_lat, p.center_lng,
         p.grid_points, p.avg_rank, p.pct_in_top3, p.competitors, p.findings,
         p.ai_visibility_summary, p.created_at
  from prospect_audits p
  where p.share_token = p_token;
$$;

-- Published landing page by clinic booking_slug + page slug (single row).
create or replace function get_published_landing_page(
  p_booking_slug text,
  p_slug         text
)
returns table (
  title            text,
  meta_description text,
  html_content     text,
  schema_jsonld    text,
  target_area      text,
  published_at     timestamptz,
  business_name    text,
  phone            text,
  city             text,
  area             text
)
language sql
stable
security definer
set search_path = public
as $$
  select lp.title, lp.meta_description, lp.html_content, lp.schema_jsonld,
         lp.target_area, lp.published_at,
         c.business_name, c.phone, c.city, c.area
  from landing_pages lp
  join clinics c on c.id = lp.clinic_id
  where c.booking_slug = p_booking_slug
    and lp.slug = p_slug
    and lp.status = 'published';
$$;

revoke execute on function get_prospect_audit_by_token(text) from public;
revoke execute on function get_published_landing_page(text, text) from public;
grant execute on function get_prospect_audit_by_token(text) to anon, authenticated;
grant execute on function get_published_landing_page(text, text) to anon, authenticated;
