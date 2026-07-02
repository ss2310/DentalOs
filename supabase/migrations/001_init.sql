-- ============================================================
-- GrowthOS — initial schema
-- Multi-tenant SaaS for Indian dental clinics.
-- Tenancy: every row carries clinic_id; isolation enforced by
-- RLS keyed to the logged-in user's profiles.home_clinic_id.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ENUMS
-- ------------------------------------------------------------

create type user_role as enum ('clinic_owner', 'doctor', 'receptionist');

create type appointment_status as enum (
  'scheduled', 'confirmed', 'arrived', 'in_chair', 'completed',
  'no_show', 'cancelled_patient', 'rescheduled', 'recovery_sent'
);

create type payment_mode as enum ('cash', 'upi', 'card', 'insurance');
create type payment_status as enum ('paid', 'partial', 'pending');

create type age_bucket as enum ('current', 'days_30', 'days_60', 'days_90_plus');

create type pipeline_stage as enum (
  'identified', 'presented', 'thinking', 'accepted',
  'scheduled', 'completed', 'rejected'
);

create type recall_type as enum (
  'general_checkup', 'cleaning', 'follow_up', 'ortho_adjustment'
);
create type recall_status as enum (
  'pending', 'reminded', 'scheduled', 'completed', 'dismissed'
);

create type lead_source as enum (
  'google', 'instagram', 'walk_in', 'referral', 'justdial', 'webchat', 'other'
);
create type lead_status as enum (
  'new', 'contacted', 'interested', 'booked', 'converted', 'lost'
);

create type interaction_type as enum (
  'reminder_24h', 'reminder_1h', 'recovery_noshow', 'recovery_cancelled',
  'review_request', 'payment_reminder', 'case_follow_up', 'recall_reminder',
  'birthday', 'broadcast'
);
create type interaction_channel as enum ('whatsapp', 'call', 'sms');

create type recovery_type as enum (
  'no_show', 'cancelled', 'deferred_treatment', 'recall_overdue',
  'outstanding_payment'
);
create type recovery_outcome as enum (
  'rebooked', 'accepted', 'returned', 'paid', 'lost'
);

create type notification_type as enum (
  'reminder_due', 'review_due', 'recovery_due', 'payment_due',
  'recall_due', 'case_follow_up', 'system', 'birthday'
);
create type notification_priority as enum ('urgent', 'important', 'routine');
create type notification_status as enum ('unread', 'read', 'acted_on');

create type content_status as enum ('draft', 'scheduled', 'published');

create type referral_status as enum (
  'link_created', 'clicked', 'enquired', 'converted'
);

create type survey_route as enum ('review_request', 'private_followup');

create type campaign_segment as enum (
  'dormant_6mo', 'dormant_12mo', 'treatment_followup',
  'outstanding_balance', 'birthday_month', 'custom'
);
create type campaign_status as enum ('draft', 'active', 'done');

-- ------------------------------------------------------------
-- 2. TABLES
-- ------------------------------------------------------------

-- Tenant root. No clinic_id — this IS the clinic.
create table clinics (
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
create table profiles (
  id                        uuid primary key references auth.users (id) on delete cascade,
  full_name                 text not null default '',
  role                      user_role not null default 'receptionist',
  home_clinic_id            uuid references clinics (id) on delete restrict,
  unread_notification_count integer not null default 0,
  created_at                timestamptz not null default now()
);

create table patients (
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
create table rate_cards (
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

create table appointments (
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

create table visit_logs (
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

create table outstandings (
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

create table case_pipeline (
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

create table recalls (
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

create table lead_logs (
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

create table interactions (
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

create table recovery_events (
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

create table notifications (
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
create table post_types (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  platform        text not null,
  credits_cost    integer not null default 1,
  prompt_template text not null,
  schema_template text,
  extra_fields    jsonb,
  created_at      timestamptz not null default now()
);

create table generated_content (
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

create table referrals (
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

create table survey_responses (
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

create table campaigns (
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

create table campaign_sends (
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

create index idx_profiles_home_clinic     on profiles (home_clinic_id);
create index idx_patients_clinic          on patients (clinic_id);
create index idx_patients_clinic_name     on patients (clinic_id, full_name);
create index idx_rate_cards_clinic        on rate_cards (clinic_id);
create index idx_appointments_clinic_date on appointments (clinic_id, appointment_date);
create index idx_appointments_patient     on appointments (patient_id);
create index idx_visit_logs_clinic_date   on visit_logs (clinic_id, visit_date);
create index idx_visit_logs_patient       on visit_logs (patient_id);
create index idx_outstandings_clinic      on outstandings (clinic_id, age_bucket);
create index idx_outstandings_patient     on outstandings (patient_id);
create index idx_case_pipeline_clinic     on case_pipeline (clinic_id, stage);
create index idx_recalls_clinic_due       on recalls (clinic_id, due_date, status);
create index idx_lead_logs_clinic         on lead_logs (clinic_id, status);
create index idx_interactions_clinic      on interactions (clinic_id);
create index idx_interactions_patient     on interactions (patient_id);
create index idx_recovery_events_clinic   on recovery_events (clinic_id);
create index idx_notifications_clinic     on notifications (clinic_id);
create index idx_notifications_target     on notifications (target_user_id, status);
create index idx_generated_content_clinic on generated_content (clinic_id);
create index idx_referrals_clinic         on referrals (clinic_id);
create index idx_survey_responses_clinic  on survey_responses (clinic_id);
create index idx_campaigns_clinic         on campaigns (clinic_id);
create index idx_campaign_sends_clinic    on campaign_sends (clinic_id);
create index idx_campaign_sends_campaign  on campaign_sends (campaign_id);

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

-- Standard tenant tables: full CRUD, always locked to the user's clinic.
-- The clinic check is in USING (reads/updates/deletes) AND WITH CHECK
-- (inserts/updated rows), so rows can never cross clinics.
do $$
declare
  t text;
begin
  foreach t in array array[
    'patients', 'rate_cards', 'appointments', 'visit_logs', 'outstandings',
    'case_pipeline', 'recalls', 'lead_logs', 'interactions',
    'recovery_events', 'generated_content', 'referrals', 'survey_responses',
    'campaigns', 'campaign_sends'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);

    execute format(
      'create policy %I on %I for select to authenticated
         using (clinic_id = current_clinic_id())',
      t || '_select', t);
    execute format(
      'create policy %I on %I for insert to authenticated
         with check (clinic_id = current_clinic_id())',
      t || '_insert', t);
    execute format(
      'create policy %I on %I for update to authenticated
         using (clinic_id = current_clinic_id())
         with check (clinic_id = current_clinic_id())',
      t || '_update', t);
    execute format(
      'create policy %I on %I for delete to authenticated
         using (clinic_id = current_clinic_id())',
      t || '_delete', t);
  end loop;
end $$;

-- clinics: read/update your own clinic only. No insert/delete from the
-- client — clinics are created during onboarding via the service role.
alter table clinics enable row level security;
alter table clinics force row level security;

create policy clinics_select on clinics for select to authenticated
  using (id = current_clinic_id());
create policy clinics_update on clinics for update to authenticated
  using (id = current_clinic_id())
  with check (id = current_clinic_id());

-- profiles: see colleagues in your clinic (and always yourself);
-- update only your own row. Inserts happen via the signup trigger.
alter table profiles enable row level security;
alter table profiles force row level security;

create policy profiles_select on profiles for select to authenticated
  using (home_clinic_id = current_clinic_id() or id = auth.uid());
create policy profiles_update on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- notifications: writes are clinic-scoped (covered below), but reads are
-- narrowed — you see a notification only if it targets you directly or
-- is role/clinic-wide (target_user_id is null).
alter table notifications enable row level security;
alter table notifications force row level security;

create policy notifications_select on notifications for select to authenticated
  using (
    clinic_id = current_clinic_id()
    and (target_user_id = auth.uid() or target_user_id is null)
  );
create policy notifications_insert on notifications for insert to authenticated
  with check (clinic_id = current_clinic_id());
create policy notifications_update on notifications for update to authenticated
  using (
    clinic_id = current_clinic_id()
    and (target_user_id = auth.uid() or target_user_id is null)
  )
  with check (clinic_id = current_clinic_id());
create policy notifications_delete on notifications for delete to authenticated
  using (
    clinic_id = current_clinic_id()
    and (target_user_id = auth.uid() or target_user_id is null)
  );

-- post_types: global, read-only. SELECT for any authenticated user;
-- no write policies at all, so only the service role can seed/modify.
alter table post_types enable row level security;
alter table post_types force row level security;

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
