-- 004_notifications.sql
-- Notification system: atomic create/read helpers that keep each user's
-- profiles.unread_notification_count in sync, plus the two scheduled jobs
-- (morning briefing @ 7:00 AM IST, weekly maintenance @ Sun 00:00 IST).
--
-- Idempotent: safe to re-run. Requires 001_init.sql.
--
-- DASHBOARD STEP: the two cron.schedule() calls at the bottom need the
-- pg_cron extension. Enable it once in Dashboard → Database → Extensions
-- (search "pg_cron", toggle on) BEFORE running this file. See instructions
-- printed by the assistant / TESTING.md.

-- ---------------------------------------------------------------------------
-- create_notification: single entry point for making a notification. Inserts
-- the row AND bumps the unread counter for the right profile(s):
--   * target_user_id given  → just that user
--   * target_user_id null   → every profile in the clinic (clinic-wide)
--
-- SECURITY DEFINER because the profiles RLS update policy only lets a user
-- touch their OWN row; bumping colleagues' counters needs to bypass it. To
-- stop a logged-in user spamming another clinic, we verify clinic membership
-- when called with a session (auth.uid() not null). The scheduled jobs and
-- service role run with auth.uid() = null and skip that check.
-- ---------------------------------------------------------------------------
create or replace function create_notification(
  p_clinic_id          uuid,
  p_type               notification_type,
  p_priority           notification_priority,
  p_title              text,
  p_body               text default null,
  p_action_url         text default null,
  p_related_patient_id uuid default null,
  p_target_user_id     uuid default null,
  p_target_role        user_role default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is not null then
    if not exists (
      select 1 from profiles
      where id = auth.uid() and home_clinic_id = p_clinic_id
    ) then
      raise exception 'not authorized for this clinic';
    end if;
  end if;

  insert into notifications (
    clinic_id, target_user_id, target_role, type, priority,
    title, body, action_url, related_patient_id
  ) values (
    p_clinic_id, p_target_user_id, p_target_role, p_type, p_priority,
    p_title, p_body, p_action_url, p_related_patient_id
  )
  returning id into v_id;

  if p_target_user_id is not null then
    update profiles
      set unread_notification_count = unread_notification_count + 1
      where id = p_target_user_id;
  else
    update profiles
      set unread_notification_count = unread_notification_count + 1
      where home_clinic_id = p_clinic_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function create_notification(
  uuid, notification_type, notification_priority, text, text, text, uuid, uuid, user_role
) from public, anon;
grant execute on function create_notification(
  uuid, notification_type, notification_priority, text, text, text, uuid, uuid, user_role
) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_notification_read: flip one notification to 'read' (only if the caller
-- may see it and it was unread) and decrement the caller's counter, floored.
-- ---------------------------------------------------------------------------
create or replace function mark_notification_read(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_clinic uuid;
  v_hit    boolean;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select home_clinic_id into v_clinic from profiles where id = v_uid;

  update notifications
    set status = 'read'
    where id = p_id
      and clinic_id = v_clinic
      and (target_user_id = v_uid or target_user_id is null)
      and status = 'unread'
    returning true into v_hit;

  if v_hit then
    update profiles
      set unread_notification_count = greatest(unread_notification_count - 1, 0)
      where id = v_uid;
  end if;
end;
$$;

revoke execute on function mark_notification_read(uuid) from public, anon;
grant execute on function mark_notification_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_all_notifications_read: flip all of the caller's visible unread
-- notifications to 'read' and zero their counter.
-- ---------------------------------------------------------------------------
create or replace function mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_clinic uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select home_clinic_id into v_clinic from profiles where id = v_uid;

  update notifications
    set status = 'read'
    where clinic_id = v_clinic
      and (target_user_id = v_uid or target_user_id is null)
      and status = 'unread';

  update profiles set unread_notification_count = 0 where id = v_uid;
end;
$$;

revoke execute on function mark_all_notifications_read() from public, anon;
grant execute on function mark_all_notifications_read() to authenticated;

-- ---------------------------------------------------------------------------
-- run_morning_briefing: one grouped notification per check per active clinic,
-- only when the check count > 0. Run daily at 7:00 AM IST by pg_cron.
-- ---------------------------------------------------------------------------
create or replace function run_morning_briefing()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c          record;
  v_count    integer;
  v_sum      numeric;
  v_today    date := (now() at time zone 'Asia/Kolkata')::date;
  v_tomorrow date := ((now() at time zone 'Asia/Kolkata')::date) + 1;
begin
  for c in select id from clinics where is_active loop
    -- (a) appointments tomorrow needing a 24h reminder
    select count(*) into v_count
    from appointments
    where clinic_id = c.id
      and appointment_date = v_tomorrow
      and status in ('scheduled', 'confirmed')
      and reminder_24h_sent_at is null;
    if v_count > 0 then
      perform create_notification(
        c.id, 'reminder_due', 'important',
        v_count || ' patients need 24h reminders', null, '/appointments');
    end if;

    -- (b) completed 2-7 days ago, review not yet requested
    select count(*) into v_count
    from appointments
    where clinic_id = c.id
      and status = 'completed'
      and review_requested = false
      and appointment_date between v_today - 7 and v_today - 2;
    if v_count > 0 then
      perform create_notification(
        c.id, 'review_due', 'routine',
        v_count || ' review requests pending', null, null);
    end if;

    -- (c) no-shows still awaiting recovery
    select count(*) into v_count
    from appointments
    where clinic_id = c.id
      and status = 'no_show'
      and recovery_sent_at is null;
    if v_count > 0 then
      perform create_notification(
        c.id, 'recovery_due', 'urgent',
        v_count || ' no-shows need recovery', null, '/appointments');
    end if;

    -- (d) outstanding balances aged 30+ days
    select count(*), coalesce(sum(nett_due), 0) into v_count, v_sum
    from outstandings
    where clinic_id = c.id
      and nett_due > 0
      and age_bucket in ('days_30', 'days_60', 'days_90_plus');
    if v_count > 0 then
      perform create_notification(
        c.id, 'payment_due', 'important',
        '₹' || round(v_sum)::bigint || ' overdue from ' || v_count || ' patients',
        null, '/billing');
    end if;

    -- (e) recalls due within the next 7 days
    select count(*) into v_count
    from recalls
    where clinic_id = c.id
      and status = 'pending'
      and due_date <= v_today + 7;
    if v_count > 0 then
      perform create_notification(
        c.id, 'recall_due', 'routine',
        v_count || ' recalls due this week', null, '/recalls');
    end if;

    -- (f) pipeline "thinking" cases whose follow-up is due
    select count(*), coalesce(sum(plan_value), 0) into v_count, v_sum
    from case_pipeline
    where clinic_id = c.id
      and stage = 'thinking'
      and follow_up_date <= v_today;
    if v_count > 0 then
      perform create_notification(
        c.id, 'case_follow_up', 'important',
        v_count || ' follow-ups due (₹' || round(v_sum)::bigint || ')',
        null, '/pipeline');
    end if;
  end loop;
end;
$$;

revoke execute on function run_morning_briefing() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- run_weekly_maintenance: recompute outstanding age buckets from the visit
-- date and purge notifications older than 14 days. Run Sun 00:00 IST.
-- ---------------------------------------------------------------------------
create or replace function run_weekly_maintenance()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  update outstandings o
    set age_bucket = case
      when v_today - v.visit_date <= 30 then 'current'
      when v_today - v.visit_date <= 60 then 'days_30'
      when v_today - v.visit_date <= 90 then 'days_60'
      else 'days_90_plus'
    end::age_bucket
    from visit_logs v
    where o.visit_log_id = v.id
      and o.nett_due > 0;

  delete from notifications where created_at < now() - interval '14 days';
end;
$$;

revoke execute on function run_weekly_maintenance() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Scheduling (pg_cron). Cron runs in UTC:
--   7:00 AM IST      = 01:30 UTC daily
--   Sun 00:00 IST    = Sat 18:30 UTC weekly
-- Re-running is safe: we unschedule the job name first if it exists.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'morning-briefing') then
      perform cron.unschedule('morning-briefing');
    end if;
    if exists (select 1 from cron.job where jobname = 'weekly-maintenance') then
      perform cron.unschedule('weekly-maintenance');
    end if;

    perform cron.schedule('morning-briefing', '30 1 * * *',
      $cron$select run_morning_briefing();$cron$);
    perform cron.schedule('weekly-maintenance', '30 18 * * 6',
      $cron$select run_weekly_maintenance();$cron$);
  else
    raise notice 'pg_cron not installed — enable it in Dashboard → Database → Extensions, then re-run this file to register the schedules.';
  end if;
end;
$$;
