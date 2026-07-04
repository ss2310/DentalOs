-- 022_admin_dashboard.sql
-- The super-admin operations console: cross-tenant read helpers + audited,
-- atomic admin ACTION functions for hand-onboarding clinics.
--
-- SECURITY — every function here is SECURITY DEFINER and EXECUTE-granted to
-- `service_role` ONLY (revoked from public/anon/authenticated). The app reaches
-- them exclusively through requireAdminContext() (lib/admin/auth.ts), which
-- re-verifies profiles.is_super_admin server-side and hands out the service-role
-- client. Normal clinic RLS is UNCHANGED — clinic users stay fully isolated and
-- cannot call any of these. Every admin WRITE records a billing_events row with
-- actor = the admin's user id.
--
-- Idempotent: create-or-replace, guarded constraint swap. Requires 001 (clinics,
-- profiles, interactions), 019 (subscription cols, billing_events, plans), 020
-- (grant_credits), 021 (past_due_since).

-- ---------------------------------------------------------------------------
-- 1. Allow the two new admin billing_events types.
-- ---------------------------------------------------------------------------
alter table billing_events drop constraint if exists billing_events_event_type_check;
alter table billing_events add constraint billing_events_event_type_check
  check (event_type in (
    'trial_started','payment_received','plan_changed','past_due',
    'deactivated','reactivated','topup','trial_extended','credit_grant'));

-- ---------------------------------------------------------------------------
-- 2. READ HELPERS (service-role only)
-- ---------------------------------------------------------------------------

-- Aggregate stats for the /admin overview, in one round trip.
create or replace function admin_overview_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total_clinics', (select count(*) from clinics),
    'trial',        (select count(*) from clinics where subscription_status = 'trial'),
    'active',       (select count(*) from clinics where subscription_status = 'active'),
    'past_due',     (select count(*) from clinics where subscription_status = 'past_due'),
    'deactivated',  (select count(*) from clinics where subscription_status = 'deactivated'),
    -- MRR = sum of active clinics' plan price (plans seed at 0 → 0 until priced).
    'mrr', (
      select coalesce(sum(pl.price_inr), 0)
        from clinics c join plans pl on pl.id = c.plan_id
       where c.subscription_status = 'active'
    ),
    -- Credits consumed month-to-date (IST): spends are negative deltas.
    'content_consumed_month', (
      select coalesce(-sum(delta), 0) from credit_ledger
       where reason = 'generation'
         and created_at >= (date_trunc('month', (now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata')
    ),
    'map_consumed_month', (
      select coalesce(-sum(delta), 0) from credit_ledger
       where reason = 'map_scan'
         and created_at >= (date_trunc('month', (now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata')
    ),
    'signups_week', (
      select count(*) from clinics where created_at >= now() - interval '7 days'
    )
  );
$$;

revoke execute on function admin_overview_stats() from public, anon, authenticated;
grant  execute on function admin_overview_stats() to service_role;

-- Rich cross-tenant clinic list for the /admin/clinics table. Owner email comes
-- from auth.users (only reachable inside a definer function), joined via the
-- earliest clinic_owner profile.
create or replace function admin_clinics_dashboard()
returns table (
  id                      uuid,
  business_name           text,
  owner_email             text,
  subscription_status     text,
  plan_name               text,
  trial_ends_at           timestamptz,
  current_period_end      timestamptz,
  content_credits_balance integer,
  map_credits_balance     integer,
  created_at              timestamptz,
  last_activity           timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.business_name,
    (select u.email::text
       from profiles p join auth.users u on u.id = p.id
      where p.home_clinic_id = c.id and p.role = 'clinic_owner'
      order by u.created_at asc
      limit 1) as owner_email,
    c.subscription_status,
    (select pl.name from plans pl where pl.id = c.plan_id) as plan_name,
    c.trial_ends_at,
    c.current_period_end,
    c.content_credits_balance,
    c.map_credits_balance,
    c.created_at,
    greatest(
      (select max(gc.created_at) from generated_content gc where gc.clinic_id = c.id),
      (select max(rs.scanned_at)  from rank_scans rs       where rs.clinic_id = c.id),
      (select max(i.created_at)   from interactions i      where i.clinic_id = c.id)
    ) as last_activity
  from clinics c
  order by c.created_at desc;
$$;

revoke execute on function admin_clinics_dashboard() from public, anon, authenticated;
grant  execute on function admin_clinics_dashboard() to service_role;

-- ---------------------------------------------------------------------------
-- 3. ADMIN ACTION FUNCTIONS (service-role only) — each writes billing_events(actor).
-- ---------------------------------------------------------------------------

-- Mark as paid / activate: set the plan live and top up its credits.
create or replace function admin_activate_plan(
  p_clinic uuid, p_plan uuid, p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan plans%rowtype;
begin
  select * into v_plan from plans where id = p_plan;
  if not found then raise exception 'plan not found'; end if;

  update clinics set
    subscription_status = 'active',
    plan_id             = v_plan.id,
    current_period_end  = now() + case when v_plan.billing_period = 'annual'
                                       then interval '1 year' else interval '1 month' end,
    last_payment_at     = now(),
    is_active           = true,
    past_due_since      = null
   where id = p_clinic;
  if not found then raise exception 'clinic not found'; end if;

  if v_plan.content_credits > 0 then
    perform grant_credits(p_clinic, 'content', v_plan.content_credits, 'topup', null, p_actor);
  end if;
  if v_plan.map_credits > 0 then
    perform grant_credits(p_clinic, 'map', v_plan.map_credits, 'topup', null, p_actor);
  end if;

  insert into billing_events (clinic_id, event_type, status, plan_id, amount_inr, provider, note, actor)
  values (p_clinic, 'payment_received', 'confirmed', v_plan.id, v_plan.price_inr, 'manual',
          'Admin marked as paid — activated ' || v_plan.name, p_actor);
end;
$$;

revoke execute on function admin_activate_plan(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function admin_activate_plan(uuid, uuid, uuid) to service_role;

-- Grant credits: positive admin_adjust ledger entry + audit.
create or replace function admin_grant_credits(
  p_clinic uuid, p_kind text, p_amount integer, p_actor uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  -- grant_credits validates kind/amount and writes the atomic balance+ledger row.
  v_balance := grant_credits(p_clinic, p_kind, p_amount, 'admin_adjust', null, p_actor);
  insert into billing_events (clinic_id, event_type, note, actor)
  values (p_clinic, 'credit_grant',
          'Granted ' || p_amount || ' ' || p_kind || ' credits', p_actor);
  return v_balance;
end;
$$;

revoke execute on function admin_grant_credits(uuid, text, integer, uuid) from public, anon, authenticated;
grant  execute on function admin_grant_credits(uuid, text, integer, uuid) to service_role;

-- Extend trial by N days. Reopens a lapsed (past_due) trial if the new end is
-- still in the future.
create or replace function admin_extend_trial(
  p_clinic uuid, p_days integer, p_actor uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_new    timestamptz;
begin
  if p_days is null or p_days <= 0 then raise exception 'invalid day count'; end if;
  select subscription_status into v_status from clinics where id = p_clinic;
  if not found then raise exception 'clinic not found'; end if;

  update clinics
     set trial_ends_at = coalesce(trial_ends_at, now()) + make_interval(days => p_days)
   where id = p_clinic
  returning trial_ends_at into v_new;

  if v_status = 'past_due' and v_new > now() then
    update clinics
       set subscription_status = 'trial', is_active = true, past_due_since = null
     where id = p_clinic;
  end if;

  insert into billing_events (clinic_id, event_type, note, actor)
  values (p_clinic, 'trial_extended', 'Extended trial by ' || p_days || ' days', p_actor);
  return v_new;
end;
$$;

revoke execute on function admin_extend_trial(uuid, integer, uuid) from public, anon, authenticated;
grant  execute on function admin_extend_trial(uuid, integer, uuid) to service_role;

-- Change plan tier only (no credit/period change).
create or replace function admin_change_plan(
  p_clinic uuid, p_plan uuid, p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan plans%rowtype;
begin
  select * into v_plan from plans where id = p_plan;
  if not found then raise exception 'plan not found'; end if;

  update clinics set plan_id = v_plan.id where id = p_clinic;
  if not found then raise exception 'clinic not found'; end if;

  insert into billing_events (clinic_id, event_type, status, plan_id, note, actor)
  values (p_clinic, 'plan_changed', 'confirmed', v_plan.id,
          'Admin changed plan to ' || v_plan.name, p_actor);
end;
$$;

revoke execute on function admin_change_plan(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function admin_change_plan(uuid, uuid, uuid) to service_role;

-- Deactivate / reactivate.
create or replace function admin_set_status(
  p_clinic uuid, p_active boolean, p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_active then
    update clinics set
      subscription_status = 'active', is_active = true,
      deactivated_at = null, past_due_since = null
     where id = p_clinic;
    if not found then raise exception 'clinic not found'; end if;
    insert into billing_events (clinic_id, event_type, note, actor)
    values (p_clinic, 'reactivated', 'Admin reactivated account', p_actor);
  else
    update clinics set
      subscription_status = 'deactivated', is_active = false, deactivated_at = now()
     where id = p_clinic;
    if not found then raise exception 'clinic not found'; end if;
    insert into billing_events (clinic_id, event_type, note, actor)
    values (p_clinic, 'deactivated', 'Admin deactivated account', p_actor);
  end if;
end;
$$;

revoke execute on function admin_set_status(uuid, boolean, uuid) from public, anon, authenticated;
grant  execute on function admin_set_status(uuid, boolean, uuid) to service_role;
