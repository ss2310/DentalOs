-- 021_subscription_lifecycle.sql
-- Daily trial/subscription lifecycle automation, run in-database by pg_cron —
-- the SAME pattern as run_morning_briefing (004), NOT a Deno Edge Function.
-- Drives the state machine over time and nudges owners to upgrade:
--   trial → (7/2/0-day reminders) → past_due (on expiry) → deactivated (after grace)
--   active → past_due (on renewal lapse) → deactivated (after grace)
--
-- The job automates STATE + in-app notifications only. It cannot send WhatsApp
-- (CLAUDE.md rule 3 — wa.me links are always human-tapped), so the one-tap owner
-- outreach is surfaced to the super-admin in /admin/subscriptions. No email in
-- this version — a commented Resend seam is left at each stage.
--
-- Idempotent: create-or-replace, add-column/table-if-not-exists, unschedule-then-
-- schedule. Requires 001 (clinics, current_clinic_id), 004 (create_notification),
-- 019 (subscription columns, billing_events, is_super_admin), 020 (status values).

-- ---------------------------------------------------------------------------
-- 1. Grace clock + reminder ledger
-- ---------------------------------------------------------------------------
alter table clinics add column if not exists past_due_since timestamptz;

-- One row per (clinic, stage) — anti-duplicate for the trial nudges (each fires
-- once) plus a light history the admin dunning list can show. Super-admin read
-- only; written solely by the definer function below.
create table if not exists subscription_reminders (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics (id) on delete cascade,
  stage      text not null,     -- 'trial_7' | 'trial_2' | 'trial_0' | 'past_due' | 'deactivated'
  created_at timestamptz not null default now()
);

create unique index if not exists uq_subscription_reminders_clinic_stage
  on subscription_reminders (clinic_id, stage);
create index if not exists idx_subscription_reminders_clinic
  on subscription_reminders (clinic_id, created_at desc);

alter table subscription_reminders enable row level security;
alter table subscription_reminders force row level security;
drop policy if exists subscription_reminders_select on subscription_reminders;
create policy subscription_reminders_select on subscription_reminders for select to authenticated
  using (is_super_admin());
-- No insert/update/delete policies → only the definer function / service role writes.

-- ---------------------------------------------------------------------------
-- 2. run_subscription_lifecycle — the daily job
--    TUNABLES: edit the two constants below and re-run this file to change the
--    reminder day-offsets or the past_due grace window.
-- ---------------------------------------------------------------------------
create or replace function run_subscription_lifecycle()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c           record;
  v_today     date := (now() at time zone 'Asia/Kolkata')::date;
  v_days_left integer;
  -- ── TUNABLES ────────────────────────────────────────────────────────────
  c_reminder_offsets constant integer[] := array[7, 2, 0]; -- trial nudge days
  c_grace_days       constant integer   := 3;              -- past_due → deactivated
  -- ────────────────────────────────────────────────────────────────────────
begin
  for c in
    select id, business_name, subscription_status, trial_ends_at,
           current_period_end, past_due_since
      from clinics
     where subscription_status in ('trial', 'active', 'past_due')
  loop
    -- 1) TRIAL REMINDERS — while still on trial and not yet past the end date.
    if c.subscription_status = 'trial'
       and c.trial_ends_at is not null
       and c.trial_ends_at >= now() then
      v_days_left := (c.trial_ends_at at time zone 'Asia/Kolkata')::date - v_today;
      if v_days_left = any (c_reminder_offsets)
         and not exists (
           select 1 from subscription_reminders
            where clinic_id = c.id and stage = 'trial_' || v_days_left
         ) then
        perform create_notification(
          c.id, 'system', 'important',
          case
            when v_days_left = 0 then 'Your free trial ends today'
            when v_days_left = 1 then 'Your free trial ends tomorrow'
            else 'Your free trial ends in ' || v_days_left || ' days'
          end,
          'Upgrade to keep your account active.',
          '/upgrade');
        insert into subscription_reminders (clinic_id, stage)
          values (c.id, 'trial_' || v_days_left)
          on conflict (clinic_id, stage) do nothing;
        -- EMAIL SEAM: send the "trial ending in N days" email here later
        -- (e.g. pg_net.http_post to an app route that calls Resend). Off now.
      end if;
    end if;

    -- 2) TRIAL EXPIRY → past_due (grace clock starts now).
    if c.subscription_status = 'trial'
       and c.trial_ends_at is not null
       and c.trial_ends_at < now() then
      update clinics
         set subscription_status = 'past_due', past_due_since = now()
       where id = c.id;
      insert into billing_events (clinic_id, event_type, note)
        values (c.id, 'past_due', 'Trial expired');
      perform create_notification(
        c.id, 'system', 'important',
        'Your free trial has ended',
        'Upgrade to reactivate your account.',
        '/upgrade');
      insert into subscription_reminders (clinic_id, stage)
        values (c.id, 'past_due') on conflict (clinic_id, stage) do nothing;
      -- EMAIL SEAM: "trial ended" email here later. Off now.

    -- 3) ACTIVE RENEWAL LAPSE → past_due (manual/lapsed subs; gateway comes later).
    elsif c.subscription_status = 'active'
       and c.current_period_end is not null
       and c.current_period_end < now() then
      update clinics
         set subscription_status = 'past_due', past_due_since = now()
       where id = c.id;
      insert into billing_events (clinic_id, event_type, note)
        values (c.id, 'past_due', 'Subscription renewal lapsed');
      perform create_notification(
        c.id, 'system', 'important',
        'Your subscription needs renewal',
        'Upgrade to keep your account active.',
        '/upgrade');
      insert into subscription_reminders (clinic_id, stage)
        values (c.id, 'past_due') on conflict (clinic_id, stage) do nothing;
      -- EMAIL SEAM: "renewal lapsed" email here later. Off now.

    -- 4) GRACE + DEACTIVATION → deactivated after c_grace_days in past_due.
    elsif c.subscription_status = 'past_due'
       and c.past_due_since is not null
       and c.past_due_since < now() - make_interval(days => c_grace_days) then
      update clinics
         set subscription_status = 'deactivated',
             is_active           = false,
             deactivated_at      = now()
       where id = c.id;
      insert into billing_events (clinic_id, event_type, note)
        values (c.id, 'deactivated',
                'Deactivated after ' || c_grace_days || '-day grace');
      perform create_notification(
        c.id, 'system', 'important',
        'Your account has been deactivated',
        'Upgrade to reactivate your account.',
        '/upgrade');
      insert into subscription_reminders (clinic_id, stage)
        values (c.id, 'deactivated') on conflict (clinic_id, stage) do nothing;
      -- EMAIL SEAM: "account deactivated" email here later. Off now.
    end if;
  end loop;
end;
$$;

revoke execute on function run_subscription_lifecycle() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Schedule (pg_cron). Cron runs in UTC:
--      7:15 AM IST = 01:45 UTC daily (just after the 7:00 AM morning briefing).
--    Re-running is safe: unschedule the job name first if it exists.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'subscription-lifecycle') then
      perform cron.unschedule('subscription-lifecycle');
    end if;
    perform cron.schedule('subscription-lifecycle', '45 1 * * *',
      $cron$select run_subscription_lifecycle();$cron$);
  else
    raise notice 'pg_cron not installed — enable it in Dashboard → Database → Extensions, then re-run this file to register the schedule.';
  end if;
end;
$$;
