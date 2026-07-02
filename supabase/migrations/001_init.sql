-- ============================================================
-- GrowthOS — initial schema
-- Multi-tenant SaaS for Indian dental clinics.
-- Tenancy: every row carries clinic_id; isolation enforced by
-- RLS keyed to the logged-in user's profiles.home_clinic_id.
--
-- This migration is IDEMPOTENT — safe to run on a fresh project or
-- re-run on an existing one. RLS is enabled with explicit, static
-- statements per table (no dynamic DO block) so Supabase's linter can
-- verify every table is protected.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ENUMS  (guarded so re-runs don't error on duplicate_object)
-- ------------------------------------------------------------

do $$ begin
  create type user_role as enum ('clinic_owner', 'doctor', 'receptionist');
exception when duplicate_object then null; end $$;

do $$ begin
  create type appointment_status as enum (
    'scheduled', 'confirmed', 'arrived', 'in_chair', 'completed',
    'no_show', 'cancelled_patient', 'rescheduled', 'recovery_sent'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_mode as enum ('cash', 'upi', 'card', 'insurance');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('paid', 'partial', 'pending');
exception when duplicate_object then null; end $$;

do $$ begin
  create type age_bucket as enum ('current', 'days_30', 'days_60', 'days_90_plus');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pipeline_stage as enum (
    'identified', 'presented', 'thinking', 'accepted',
    'scheduled', 'completed', 'rejected'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type recall_type as enum (
    'general_checkup', 'cleaning', 'follow_up', 'ortho_adjustment'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type recall_status as enum (
    'pending', 'reminded', 'scheduled', 'completed', 'dismissed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_source as enum (
    'google', 'instagram', 'walk_in', 'referral', 'justdial', 'webchat', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_status as enum (
    'new', 'contacted', 'interested', 'booked', 'converted', 'lost'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type interaction_type as enum (
    'reminder_24h', 'reminder_1h', 'recovery_noshow', 'recovery_cancelled',
    'review_request', 'payment_reminder', 'case_follow_up', 'recall_reminder',
    'birthday', 'broadcast'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type interaction_channel as enum ('whatsapp', 'call', 'sms');
exception when duplicate_object then null; end $$;

do $$ begin
  create type recovery_type as enum (
    'no_show', 'cancelled', 'deferred_treatment', 'recall_overdue',
    'outstanding_payment'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type recovery_outcome as enum (
    'rebooked', 'accepted', 'returned', 'paid', 'lost'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_type as enum (
    'reminder_due', 'review_due', 'recovery_due', 'payment_due',
    'recall_due', 'case_follow_up', 'system', 'birthday'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_priority as enum ('urgent', 'important', 'routine');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_status as enum ('unread', 'read', 'acted_on');
exception when duplicate_object then null; end $$;

do $$ begin
  create type content_status as enum ('draft', 'scheduled', 'published');
exception when duplicate_object then null; end $$;

do $$ begin
  create type referral_status as enum (
    'link_created', 'clicked', 'enquired', 'converted'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type survey_route as enum ('review_request', 'private_followup');
exception when duplicate_object then null; end $$;

do $$ begin
  create type campaign_segment as enum (
    'dormant_6mo', 'dormant_12mo', 'treatment_followup',
    'outstanding_balance', 'birthday_month', 'custom'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type campaign_status as enum ('draft', 'active', 'done');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- 2. TABLES
-- ------------------------------------------------------------

-- Tenant root. No clinic_id — this IS the clinic.
create table if not exists clinics (
  id                uuid primary key default gen_random_uuid(),
  business_name     text not null,
  doctor_name       text,
  phone             text,
  address           text,
  city              text,
  area              text,
  google_review_url text,
  instagram_handle  text,
  website_url       text,
  monthly_credits   integer not null default 100,
  credits_used      integer not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

-- Extends auth.users. Created by the handle_new_user trigger on signup.
create table if not exists profiles (
  id                        uuid primary key references auth.users (id) on delete cascade,
  full_name                 text not null default '',
  role                      user_role not null default 'receptionist',
  home_clinic_id            uuid references clinics (id) on delete restrict,
  unread_notification_count integer not null default 0,
  created_at                timestamptz not null default now()
);

create table if not exists patients (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics (id) on delete restrict,
  full_name         text not null,
  whatsapp_number   text,
  phone             text,
  date_of_birth     date,
  gender            text,
  area              text,
  notes             text,
  total_visits      integer not null default 0,
  lifetime_revenue  numeric(12,2) not null default 0,
  total_outstanding numeric(12,2) not null default 0,
  last_visit_date   date,
  created_at        timestamptz not null default now()
);

-- Never hard-delete rows here; set is_active = false instead
-- (visit_logs / appointments reference them for history).
create table if not exists rate_cards (
  id                   uuid primary key default gen_random_uuid(),
  clinic_id            uuid not null references clinics (id) on delete restrict,
  treatment_name       text not null,
  category             text,
  base_price           numeric(10,2) not null default 0,
  duration_mins        integer,
  recall_interval_days integer,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now()
);

create table if not exists appointments (
  id                   uuid primary key default gen_random_uuid(),
  clinic_id            uuid not null references clinics (id) on delete restrict,
  patient_id           uuid not null references patients (id) on delete restrict,
  appointment_date     date not null,
  appointment_time     time not null,
  treatment_type_id    uuid references rate_cards (id) on delete restrict,
  doctor               text,
  status               appointment_status not null default 'scheduled',
  reminder_24h_sent_at timestamptz,
  reminder_1h_sent_at  timestamptz,
  recovery_sent_at     timestamptz,
  review_requested     boolean not null default false,
  review_requested_at  timestamptz,
  notes                text,
  created_at           timestamptz not null default now()
);

create table if not exists visit_logs (
  id                  uuid primary key default gen_random_uuid(),
  clinic_id           uuid not null references clinics (id) on delete restrict,
  patient_id          uuid not null references patients (id) on delete restrict,
  appointment_id      uuid references appointments (id) on delete set null,
  visit_date          date not null,
  treatment_id        uuid references rate_cards (id) on delete restrict,
  -- Snapshot of the treatment name at time of visit, so renaming a
  -- rate card never rewrites history.
  treatment_name_text text not null,
  treatment_category  text,
  doctor              text,
  cost                numeric(10,2) not null default 0,
  amount_paid         numeric(10,2) not null default 0,
  outstanding_amount  numeric(10,2) not null default 0,
  payment_mode        payment_mode,
  payment_status      payment_status not null default 'pending',
  created_by          uuid references profiles (id) on delete set null,
  created_at          timestamptz not null default now()
);

create table if not exists outstandings (
  id                       uuid primary key default gen_random_uuid(),
  clinic_id                uuid not null references clinics (id) on delete restrict,
  patient_id               uuid not null references patients (id) on delete restrict,
  visit_log_id             uuid references visit_logs (id) on delete set null,
  total_amount             numeric(10,2) not null default 0,
  amount_paid              numeric(10,2) not null default 0,
  nett_due                 numeric(10,2) not null default 0,
  age_bucket               age_bucket not null default 'current',
  payment_reminder_sent_at timestamptz,
  created_at               timestamptz not null default now()
);

create table if not exists case_pipeline (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinics (id) on delete restrict,
  patient_id       uuid not null references patients (id) on delete restrict,
  treatment_id     uuid references rate_cards (id) on delete restrict,
  plan_value       numeric(12,2) not null default 0,
  stage            pipeline_stage not null default 'identified',
  presented_date   date,
  accepted_date    date,
  follow_up_date   date,
  last_follow_up   date,
  rejection_reason text,
  notes            text,
  created_at       timestamptz not null default now()
);

create table if not exists recalls (
  id                  uuid primary key default gen_random_uuid(),
  clinic_id           uuid not null references clinics (id) on delete restrict,
  patient_id          uuid not null references patients (id) on delete restrict,
  source_visit_id     uuid references visit_logs (id) on delete set null,
  source_treatment_id uuid references rate_cards (id) on delete set null,
  recall_type         recall_type not null default 'general_checkup',
  due_date            date not null,
  status              recall_status not null default 'pending',
  reminder_sent_at    timestamptz,
  completed_date      date,
  created_at          timestamptz not null default now()
);

create table if not exists lead_logs (
  id                      uuid primary key default gen_random_uuid(),
  clinic_id               uuid not null references clinics (id) on delete restrict,
  name                    text not null,
  phone                   text,
  source                  lead_source not null default 'other',
  treatment_interest      text,
  status                  lead_status not null default 'new',
  follow_up_date          date,
  converted_to_patient_id uuid references patients (id) on delete set null,
  lost_reason             text,
  notes                   text,
  created_at              timestamptz not null default now()
);

create table if not exists interactions (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics (id) on delete restrict,
  patient_id     uuid not null references patients (id) on delete restrict,
  appointment_id uuid references appointments (id) on delete set null,
  type           interaction_type not null,
  channel        interaction_channel not null default 'whatsapp',
  sent_by        uuid references profiles (id) on delete set null,
  sent_at        timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create table if not exists recovery_events (
  id                      uuid primary key default gen_random_uuid(),
  clinic_id               uuid not null references clinics (id) on delete restrict,
  patient_id              uuid not null references patients (id) on delete restrict,
  recovery_type           recovery_type not null,
  original_appointment_id uuid references appointments (id) on delete set null,
  original_case_id        uuid references case_pipeline (id) on delete set null,
  original_outstanding_id uuid references outstandings (id) on delete set null,
  trigger_date            date not null default current_date,
  action_taken_date       date,
  wa_message_sent         boolean not null default false,
  outcome                 recovery_outcome,
  outcome_date            date,
  revenue_recovered       numeric(12,2) not null default 0,
  created_at              timestamptz not null default now()
);

create table if not exists notifications (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null references clinics (id) on delete restrict,
  target_user_id     uuid references profiles (id) on delete cascade,
  target_role        user_role,
  type               notification_type not null,
  priority           notification_priority not null default 'routine',
  title              text not null,
  body               text,
  action_url         text,
  status             notification_status not null default 'unread',
  related_patient_id uuid references patients (id) on delete set null,
  created_at         timestamptz not null default now()
);

-- GLOBAL table: no clinic_id. Seeded by admin/service role;
-- read-only for authenticated users (no write policies).
create table if not exists post_types (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  platform        text not null,
  credits_cost    integer not null default 1,
  prompt_template text not null,
  schema_template text,
  extra_fields    jsonb,
  created_at      timestamptz not null default now()
);

create table if not exists generated_content (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinics (id) on delete restrict,
  post_type_id     uuid not null references post_types (id) on delete restrict,
  topic            text,
  tone_used        text,
  generated_copy   text not null,
  schema_markup    text,
  status           content_status not null default 'draft',
  credits_deducted integer not null default 0,
  published_date   date,
  created_at       timestamptz not null default now()
);

create table if not exists referrals (
  id                   uuid primary key default gen_random_uuid(),
  clinic_id            uuid not null references clinics (id) on delete restrict,
  referrer_patient_id  uuid not null references patients (id) on delete restrict,
  referral_code        text not null unique,
  referred_name        text,
  referred_phone       text,
  status               referral_status not null default 'link_created',
  converted_patient_id uuid references patients (id) on delete set null,
  reward_given         boolean not null default false,
  reward_note          text,
  created_at           timestamptz not null default now()
);

create table if not exists survey_responses (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics (id) on delete restrict,
  patient_id   uuid not null references patients (id) on delete restrict,
  visit_log_id uuid references visit_logs (id) on delete set null,
  survey_token text not null unique,
  score        integer check (score between 1 and 5),
  comment      text,
  sent_at      timestamptz not null default now(),
  responded_at timestamptz,
  routed_to    survey_route,
  created_at   timestamptz not null default now()
);

create table if not exists campaigns (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinics (id) on delete restrict,
  name             text not null,
  segment_type     campaign_segment not null,
  segment_filter   jsonb,
  message_template text not null,
  status           campaign_status not null default 'draft',
  sent_count       integer not null default 0,
  created_at       timestamptz not null default now()
);

create table if not exists campaign_sends (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics (id) on delete restrict,
  campaign_id uuid not null references campaigns (id) on delete cascade,
  patient_id  uuid not null references patients (id) on delete restrict,
  sent_at     timestamptz,
  sent_by     uuid references profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. INDEXES
-- ------------------------------------------------------------

create index if not exists idx_profiles_home_clinic     on profiles (home_clinic_id);
create index if not exists idx_patients_clinic          on patients (clinic_id);
create index if not exists idx_patients_clinic_name     on patients (clinic_id, full_name);
create index if not exists idx_rate_cards_clinic        on rate_cards (clinic_id);
create index if not exists idx_appointments_clinic_date on appointments (clinic_id, appointment_date);
create index if not exists idx_appointments_patient     on appointments (patient_id);
create index if not exists idx_visit_logs_clinic_date   on visit_logs (clinic_id, visit_date);
create index if not exists idx_visit_logs_patient       on visit_logs (patient_id);
create index if not exists idx_outstandings_clinic      on outstandings (clinic_id, age_bucket);
create index if not exists idx_outstandings_patient     on outstandings (patient_id);
create index if not exists idx_case_pipeline_clinic     on case_pipeline (clinic_id, stage);
create index if not exists idx_recalls_clinic_due       on recalls (clinic_id, due_date, status);
create index if not exists idx_lead_logs_clinic         on lead_logs (clinic_id, status);
create index if not exists idx_interactions_clinic      on interactions (clinic_id);
create index if not exists idx_interactions_patient     on interactions (patient_id);
create index if not exists idx_recovery_events_clinic   on recovery_events (clinic_id);
create index if not exists idx_notifications_clinic     on notifications (clinic_id);
create index if not exists idx_notifications_target     on notifications (target_user_id, status);
create index if not exists idx_generated_content_clinic on generated_content (clinic_id);
create index if not exists idx_referrals_clinic         on referrals (clinic_id);
create index if not exists idx_survey_responses_clinic  on survey_responses (clinic_id);
create index if not exists idx_campaigns_clinic         on campaigns (clinic_id);
create index if not exists idx_campaign_sends_clinic    on campaign_sends (clinic_id);
create index if not exists idx_campaign_sends_campaign  on campaign_sends (campaign_id);

-- ------------------------------------------------------------
-- 4. RLS HELPER
-- ------------------------------------------------------------

-- The single source of truth for "which clinic is this user in".
-- SECURITY DEFINER so it can read profiles without recursing into
-- profiles' own RLS policies.
create or replace function current_clinic_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select home_clinic_id from profiles where id = auth.uid();
$$;

revoke execute on function current_clinic_id() from public, anon;
grant execute on function current_clinic_id() to authenticated;

-- ------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ------------------------------------------------------------
-- Every table below has RLS ENABLED + FORCED with an explicit statement,
-- and every policy is dropped-if-exists first so this section is
-- re-runnable. Standard tenant tables get the same four clinic-scoped
-- policies: the clinic check lives in USING (read/update/delete) AND
-- WITH CHECK (insert/updated row), so rows can never cross clinics.

-- ---- patients ----
alter table patients enable row level security;
alter table patients force row level security;
drop policy if exists patients_select on patients;
create policy patients_select on patients for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists patients_insert on patients;
create policy patients_insert on patients for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists patients_update on patients;
create policy patients_update on patients for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists patients_delete on patients;
create policy patients_delete on patients for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- rate_cards ----
alter table rate_cards enable row level security;
alter table rate_cards force row level security;
drop policy if exists rate_cards_select on rate_cards;
create policy rate_cards_select on rate_cards for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists rate_cards_insert on rate_cards;
create policy rate_cards_insert on rate_cards for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists rate_cards_update on rate_cards;
create policy rate_cards_update on rate_cards for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists rate_cards_delete on rate_cards;
create policy rate_cards_delete on rate_cards for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- appointments ----
alter table appointments enable row level security;
alter table appointments force row level security;
drop policy if exists appointments_select on appointments;
create policy appointments_select on appointments for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists appointments_insert on appointments;
create policy appointments_insert on appointments for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists appointments_update on appointments;
create policy appointments_update on appointments for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists appointments_delete on appointments;
create policy appointments_delete on appointments for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- visit_logs ----
alter table visit_logs enable row level security;
alter table visit_logs force row level security;
drop policy if exists visit_logs_select on visit_logs;
create policy visit_logs_select on visit_logs for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists visit_logs_insert on visit_logs;
create policy visit_logs_insert on visit_logs for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists visit_logs_update on visit_logs;
create policy visit_logs_update on visit_logs for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists visit_logs_delete on visit_logs;
create policy visit_logs_delete on visit_logs for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- outstandings ----
alter table outstandings enable row level security;
alter table outstandings force row level security;
drop policy if exists outstandings_select on outstandings;
create policy outstandings_select on outstandings for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists outstandings_insert on outstandings;
create policy outstandings_insert on outstandings for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists outstandings_update on outstandings;
create policy outstandings_update on outstandings for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists outstandings_delete on outstandings;
create policy outstandings_delete on outstandings for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- case_pipeline ----
alter table case_pipeline enable row level security;
alter table case_pipeline force row level security;
drop policy if exists case_pipeline_select on case_pipeline;
create policy case_pipeline_select on case_pipeline for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists case_pipeline_insert on case_pipeline;
create policy case_pipeline_insert on case_pipeline for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists case_pipeline_update on case_pipeline;
create policy case_pipeline_update on case_pipeline for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists case_pipeline_delete on case_pipeline;
create policy case_pipeline_delete on case_pipeline for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- recalls ----
alter table recalls enable row level security;
alter table recalls force row level security;
drop policy if exists recalls_select on recalls;
create policy recalls_select on recalls for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists recalls_insert on recalls;
create policy recalls_insert on recalls for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists recalls_update on recalls;
create policy recalls_update on recalls for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists recalls_delete on recalls;
create policy recalls_delete on recalls for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- lead_logs ----
alter table lead_logs enable row level security;
alter table lead_logs force row level security;
drop policy if exists lead_logs_select on lead_logs;
create policy lead_logs_select on lead_logs for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists lead_logs_insert on lead_logs;
create policy lead_logs_insert on lead_logs for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists lead_logs_update on lead_logs;
create policy lead_logs_update on lead_logs for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists lead_logs_delete on lead_logs;
create policy lead_logs_delete on lead_logs for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- interactions ----
alter table interactions enable row level security;
alter table interactions force row level security;
drop policy if exists interactions_select on interactions;
create policy interactions_select on interactions for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists interactions_insert on interactions;
create policy interactions_insert on interactions for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists interactions_update on interactions;
create policy interactions_update on interactions for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists interactions_delete on interactions;
create policy interactions_delete on interactions for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- recovery_events ----
alter table recovery_events enable row level security;
alter table recovery_events force row level security;
drop policy if exists recovery_events_select on recovery_events;
create policy recovery_events_select on recovery_events for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists recovery_events_insert on recovery_events;
create policy recovery_events_insert on recovery_events for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists recovery_events_update on recovery_events;
create policy recovery_events_update on recovery_events for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists recovery_events_delete on recovery_events;
create policy recovery_events_delete on recovery_events for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- generated_content ----
alter table generated_content enable row level security;
alter table generated_content force row level security;
drop policy if exists generated_content_select on generated_content;
create policy generated_content_select on generated_content for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists generated_content_insert on generated_content;
create policy generated_content_insert on generated_content for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists generated_content_update on generated_content;
create policy generated_content_update on generated_content for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists generated_content_delete on generated_content;
create policy generated_content_delete on generated_content for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- referrals ----
alter table referrals enable row level security;
alter table referrals force row level security;
drop policy if exists referrals_select on referrals;
create policy referrals_select on referrals for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists referrals_insert on referrals;
create policy referrals_insert on referrals for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists referrals_update on referrals;
create policy referrals_update on referrals for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists referrals_delete on referrals;
create policy referrals_delete on referrals for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- campaigns ----
alter table campaigns enable row level security;
alter table campaigns force row level security;
drop policy if exists campaigns_select on campaigns;
create policy campaigns_select on campaigns for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists campaigns_insert on campaigns;
create policy campaigns_insert on campaigns for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists campaigns_update on campaigns;
create policy campaigns_update on campaigns for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists campaigns_delete on campaigns;
create policy campaigns_delete on campaigns for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- campaign_sends ----
alter table campaign_sends enable row level security;
alter table campaign_sends force row level security;
drop policy if exists campaign_sends_select on campaign_sends;
create policy campaign_sends_select on campaign_sends for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists campaign_sends_insert on campaign_sends;
create policy campaign_sends_insert on campaign_sends for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists campaign_sends_update on campaign_sends;
create policy campaign_sends_update on campaign_sends for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists campaign_sends_delete on campaign_sends;
create policy campaign_sends_delete on campaign_sends for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- survey_responses ----
-- Clinic-scoped like the rest; the ANON exception is handled separately by
-- the two SECURITY DEFINER functions in section 7 (no anon policy here).
alter table survey_responses enable row level security;
alter table survey_responses force row level security;
drop policy if exists survey_responses_select on survey_responses;
create policy survey_responses_select on survey_responses for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists survey_responses_insert on survey_responses;
create policy survey_responses_insert on survey_responses for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists survey_responses_update on survey_responses;
create policy survey_responses_update on survey_responses for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists survey_responses_delete on survey_responses;
create policy survey_responses_delete on survey_responses for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- clinics ----
-- Read/update your own clinic only. No insert/delete from the client —
-- clinics are created during onboarding via the service role.
alter table clinics enable row level security;
alter table clinics force row level security;
drop policy if exists clinics_select on clinics;
create policy clinics_select on clinics for select to authenticated
  using (id = current_clinic_id());
drop policy if exists clinics_update on clinics;
create policy clinics_update on clinics for update to authenticated
  using (id = current_clinic_id())
  with check (id = current_clinic_id());

-- ---- profiles ----
-- See colleagues in your clinic (and always yourself); update only your own
-- row. Inserts happen via the signup trigger (security definer).
alter table profiles enable row level security;
alter table profiles force row level security;
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated
  using (home_clinic_id = current_clinic_id() or id = auth.uid());
drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---- notifications ----
-- Writes are clinic-scoped; reads are narrowed — you see a notification only
-- if it targets you directly or is role/clinic-wide (target_user_id is null).
alter table notifications enable row level security;
alter table notifications force row level security;
drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications for select to authenticated
  using (
    clinic_id = current_clinic_id()
    and (target_user_id = auth.uid() or target_user_id is null)
  );
drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications for update to authenticated
  using (
    clinic_id = current_clinic_id()
    and (target_user_id = auth.uid() or target_user_id is null)
  )
  with check (clinic_id = current_clinic_id());
drop policy if exists notifications_delete on notifications;
create policy notifications_delete on notifications for delete to authenticated
  using (
    clinic_id = current_clinic_id()
    and (target_user_id = auth.uid() or target_user_id is null)
  );

-- ---- post_types ----
-- Global, read-only. SELECT for any authenticated user; no write policies at
-- all, so only the service role can seed/modify.
alter table post_types enable row level security;
alter table post_types force row level security;
drop policy if exists post_types_select on post_types;
create policy post_types_select on post_types for select to authenticated
  using (true);

-- ------------------------------------------------------------
-- 6. SIGNUP TRIGGER — auto-create profile
-- ------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name, role, home_clinic_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(
      (new.raw_user_meta_data ->> 'role')::user_role,
      'receptionist'
    ),
    nullif(new.raw_user_meta_data ->> 'home_clinic_id', '')::uuid
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ------------------------------------------------------------
-- 7. PUBLIC SURVEY ACCESS (tokenized, anon-safe)
-- ------------------------------------------------------------
-- survey_responses stays fully clinic-locked under RLS. Unauthenticated
-- patients interact with exactly one row via its unguessable token,
-- through these two SECURITY DEFINER functions. They expose no patient
-- or clinic data.

create or replace function get_survey_by_token(p_token text)
returns table (
  score     integer,
  comment   text,
  responded boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select s.score, s.comment, (s.responded_at is not null) as responded
  from survey_responses s
  where s.survey_token = p_token;
$$;

create or replace function submit_survey_response(
  p_token   text,
  p_score   integer,
  p_comment text default null
)
returns survey_route
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route survey_route;
begin
  if p_score is null or p_score < 1 or p_score > 5 then
    raise exception 'score must be between 1 and 5';
  end if;

  v_route := case when p_score >= 4
    then 'review_request'::survey_route
    else 'private_followup'::survey_route
  end;

  update survey_responses
     set score        = p_score,
         comment      = p_comment,
         responded_at = now(),
         routed_to    = v_route
   where survey_token = p_token
     and responded_at is null;

  if not found then
    raise exception 'invalid or already-used survey token';
  end if;

  return v_route;
end;
$$;

revoke execute on function get_survey_by_token(text) from public;
revoke execute on function submit_survey_response(text, integer, text) from public;
grant execute on function get_survey_by_token(text) to anon, authenticated;
grant execute on function submit_survey_response(text, integer, text) to anon, authenticated;
