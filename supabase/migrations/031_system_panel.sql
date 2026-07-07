-- 031_system_panel.sql
-- Backing state for the admin System panel (A3): a heartbeat table for scheduled
-- jobs / webhooks to report liveness, a self-owned applied-migrations registry
-- (Supabase's own history isn't reachable via PostgREST), and global feature-flag
-- defaults. All live in `public`, all super-admin-read / service-role-write.
--
-- Idempotent: create-if-not-exists, on-conflict seeds, create-or-replace fn,
-- unschedule-then-schedule. Requires 018 (is_super_admin), 021 (the lifecycle job
-- this re-points to a heartbeat wrapper).
-- ⚠️ DDL — run by hand in the Supabase SQL editor.

-- ===========================================================================
-- 1. HEARTBEATS — one row per background job / webhook, upserted on each run.
--    The B3/D6 crons and the future Cashfree webhook write here via
--    record_heartbeat(); the System → Health panel reads last_run_at + status.
-- ===========================================================================
create table if not exists system_heartbeats (
  job_name    text primary key,
  status      text not null default 'ok' check (status in ('ok','error')),
  detail      text,
  last_run_at timestamptz not null default now()
);

alter table system_heartbeats enable row level security;
alter table system_heartbeats force row level security;
drop policy if exists system_heartbeats_select on system_heartbeats;
create policy system_heartbeats_select on system_heartbeats for select to authenticated
  using (is_super_admin());
-- No write policies → only the service role / definer functions below write.

-- Upsert helper called by scheduled jobs + webhook handlers (definer; not for
-- clinic sessions).
create or replace function record_heartbeat(
  p_job    text,
  p_status text default 'ok',
  p_detail text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into system_heartbeats (job_name, status, detail, last_run_at)
  values (p_job, coalesce(p_status, 'ok'), p_detail, now())
  on conflict (job_name) do update
    set status = excluded.status,
        detail = excluded.detail,
        last_run_at = excluded.last_run_at;
$$;

revoke execute on function record_heartbeat(text, text, text) from public, anon, authenticated;
grant  execute on function record_heartbeat(text, text, text) to service_role;

-- Wire the EXISTING daily lifecycle job (021) to report a heartbeat, without
-- duplicating its body: a thin wrapper runs it, then records liveness. On failure
-- it re-raises to preserve 021's alerting semantics (Postgres/cron logs) — note
-- that the re-raise rolls the transaction back, so a failed run surfaces in the
-- panel as a STALE heartbeat (last_run_at stops advancing), not a fresh 'error'
-- row. The 'error' status is still recorded by jobs that commit (B3/D6/webhook).
-- The schedule is re-pointed to the wrapper.
create or replace function run_subscription_lifecycle_hb()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform run_subscription_lifecycle();
  perform record_heartbeat('subscription_lifecycle', 'ok', null);
exception when others then
  perform record_heartbeat('subscription_lifecycle', 'error', left(sqlerrm, 300));
  raise;
end;
$$;

revoke execute on function run_subscription_lifecycle_hb() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'subscription-lifecycle') then
      perform cron.unschedule('subscription-lifecycle');
    end if;
    perform cron.schedule('subscription-lifecycle', '45 1 * * *',
      $cron$select run_subscription_lifecycle_hb();$cron$);
  else
    raise notice 'pg_cron not installed — enable it, then re-run this file to register the heartbeat wrapper.';
  end if;
end;
$$;

-- ===========================================================================
-- 2. APPLIED-MIGRATIONS REGISTRY — our own, since migrations are hand-applied
--    (Supabase's supabase_migrations schema isn't exposed to PostgREST).
--    CONVENTION: every NEW migration must append its own row at the end, e.g.
--      insert into applied_migrations (version, name) values ('032','...')
--      on conflict do nothing;
-- ===========================================================================
create table if not exists applied_migrations (
  version    text primary key,
  name       text,
  applied_at timestamptz not null default now()
);

alter table applied_migrations enable row level security;
alter table applied_migrations force row level security;
drop policy if exists applied_migrations_select on applied_migrations;
create policy applied_migrations_select on applied_migrations for select to authenticated
  using (is_super_admin());

-- Backfill everything up to and including this migration (all applied by the time
-- 031 runs). Timestamps are the backfill moment for 001–031; later migrations get
-- their real apply time.
insert into applied_migrations (version, name) values
  ('001','init'),
  ('002','log_visit'),
  ('003','record_payment'),
  ('004','notifications'),
  ('005','seed_post_types'),
  ('006','treatment_plans'),
  ('007','growth_features'),
  ('008','competitor_intel'),
  ('009','citable_content'),
  ('010','insight_report'),
  ('011','landing_page_plans'),
  ('012','topic_suggestions'),
  ('013','roles_rbac'),
  ('014','profile_escalation_lockdown'),
  ('015','atomic_reservations'),
  ('016','post_visit_survey'),
  ('017','clinic_upi_id'),
  ('018','admin_panel'),
  ('019','subscriptions_credits'),
  ('020','credit_engine'),
  ('021','subscription_lifecycle'),
  ('022','admin_dashboard'),
  ('023','voice_notes'),
  ('024','notes_agent'),
  ('025','voice_notes_settings'),
  ('026','multi_vertical'),
  ('027','clinic_vertical_setter'),
  ('028','prospect_audit_vertical'),
  ('029','clinic_phone_unique'),
  ('030','plan_pack_admin'),
  ('031','system_panel')
on conflict (version) do nothing;

-- ===========================================================================
-- 3. GLOBAL FEATURE-FLAG DEFAULTS — the platform-wide default for each flag in
--    lib/admin/feature-flags.ts. A single global set today (dental is the base
--    vertical); a per-vertical dimension can slot in later. Edited from the
--    System panel; every change is admin_audit'd in app code.
-- ===========================================================================
create table if not exists feature_flag_defaults (
  flag_key   text primary key,
  enabled    boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table feature_flag_defaults enable row level security;
alter table feature_flag_defaults force row level security;
drop policy if exists feature_flag_defaults_select on feature_flag_defaults;
create policy feature_flag_defaults_select on feature_flag_defaults for select to authenticated
  using (is_super_admin());
-- No write policies → service role only (inside admin-verified handlers).

-- Seed the registry keys, all OFF (matches today's behaviour: new clinics get
-- an empty feature_flags map). Re-runs never clobber a default you've since set.
insert into feature_flag_defaults (flag_key, enabled) values
  ('campaigns', false),
  ('ai_visibility', false),
  ('prospecting', false),
  ('upi_payments', false),
  ('insight_reports', false),
  ('map_rank', false),
  ('voice_notes', false)
on conflict (flag_key) do nothing;
