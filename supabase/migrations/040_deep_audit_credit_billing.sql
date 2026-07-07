-- ============================================================
-- GrowthOS — migration 040: subscription-granted Deep Audit billing
--
-- Replaces the rolling per-cycle allowance (036) with a simple entitlement:
-- each clinic holds a `deep_audit_credits` balance, +1 granted per subscription
-- period and consumed 1 per audit run (manual OR auto).
--   * Trial: new clinics start with 1 (column default) — the free onboarding audit.
--   * Upgrade / renewal: apply_plan_purchase grants plans.deep_audits_included
--     (=1 for the Growth plan) on EVERY payment → +1 per renewal.
--   * Extra audits: a ₹599 "Deep Audit Top-up" credit_pack grants +1 via the
--     existing Cashfree pack chain (start_cashfree_checkout → confirm →
--     apply_pack_purchase). Renders on /upgrade automatically.
--
-- start_deep_audit() (session) and open_deep_audit(clinic) (service-role core,
-- used by the cron auto-reaudit) consume 1 credit and open a 'queued' run, or
-- return NULL when the balance is 0 (caller shows the ₹599 top-up CTA).
--
-- The 036 cycle columns (deep_audits_used_this_cycle / _cycle_start) are now
-- vestigial — left in place, no longer read. clinics UPDATE stays locked to the
-- 019 allow-list; deep_audit_credits moves ONLY via the SECURITY DEFINER
-- functions here + service_role.
--
-- Additive + idempotent. Requires 019 (plans, credit_packs, clinics hardening),
-- 020 (grant_credits), 033 (apply_plan_purchase / apply_pack_purchase), 036
-- (start_deep_audit / release_deep_audit). Run in the Supabase SQL editor, then:
-- notify pgrst, 'reload schema';
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Entitlement columns. clinics.deep_audit_credits DEFAULT 1 = the trial's
--    free audit (also grandfathers every existing clinic one audit).
-- ---------------------------------------------------------------------------
alter table clinics      add column if not exists deep_audit_credits   integer not null default 1;
alter table plans        add column if not exists deep_audits_included integer not null default 0;
alter table credit_packs add column if not exists deep_audits          integer not null default 0;

-- Growth (monthly/annual) plans include 1 audit per period; the trial's audit is
-- the column default, so its plan row stays 0 (never applied via a purchase).
update plans set deep_audits_included = 1 where billing_period in ('monthly','annual');

-- The ₹599 extra-audit product (content/map 0, deep_audits 1). Priced here (not
-- left at 0) since it's a fixed product; do update so a re-run keeps it correct.
insert into credit_packs (name, price_inr, content_credits, map_credits, deep_audits, is_active, sort_order)
values ('Deep Audit Top-up', 599, 0, 0, 1, true, 100)
on conflict (name) do update set
  price_inr   = excluded.price_inr,
  deep_audits = excluded.deep_audits,
  is_active   = true;

-- ---------------------------------------------------------------------------
-- 2. Grant deep-audit credits on plan + pack purchase (extends 033's cores).
--    Bodies mirror 033 exactly, with the deep_audits grant appended.
-- ---------------------------------------------------------------------------
create or replace function apply_plan_purchase(p_clinic uuid, p_plan uuid, p_actor uuid)
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
  -- One included deep audit per period (trial/upgrade/renewal each add one).
  if v_plan.deep_audits_included > 0 then
    update clinics set deep_audit_credits = deep_audit_credits + v_plan.deep_audits_included
     where id = p_clinic;
  end if;
end;
$$;
revoke execute on function apply_plan_purchase(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function apply_plan_purchase(uuid, uuid, uuid) to service_role;

create or replace function apply_pack_purchase(p_clinic uuid, p_pack uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack credit_packs%rowtype;
begin
  select * into v_pack from credit_packs where id = p_pack;
  if not found then raise exception 'credit pack not found'; end if;

  if v_pack.content_credits > 0 then
    perform grant_credits(p_clinic, 'content', v_pack.content_credits, 'topup', null, p_actor);
  end if;
  if v_pack.map_credits > 0 then
    perform grant_credits(p_clinic, 'map', v_pack.map_credits, 'topup', null, p_actor);
  end if;
  -- ₹599 "Deep Audit Top-up" → +1 audit.
  if v_pack.deep_audits > 0 then
    update clinics set deep_audit_credits = deep_audit_credits + v_pack.deep_audits
     where id = p_clinic;
  end if;

  update clinics set last_payment_at = now() where id = p_clinic;
  if not found then raise exception 'clinic not found'; end if;
end;
$$;
revoke execute on function apply_pack_purchase(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function apply_pack_purchase(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 3. open_deep_audit — the credit-consuming core (service-role / internal).
--    Row-locks the clinic, spends 1 deep_audit_credit, opens a 'queued' run.
--    Returns NULL when the balance is 0. Used by the cron auto-reaudit and by
--    the session wrapper below. NOT granted to authenticated directly (a user
--    must go through start_deep_audit(), which fixes the clinic to their own).
-- ---------------------------------------------------------------------------
create or replace function open_deep_audit(p_clinic_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credits integer;
  v_bal     integer;
  v_run     uuid;
begin
  if p_clinic_id is null then raise exception 'no clinic'; end if;

  select deep_audit_credits, map_credits_balance
    into v_credits, v_bal
    from clinics where id = p_clinic_id
    for update;
  if v_credits is null then raise exception 'clinic not found'; end if;

  if v_credits < 1 then
    return null;                              -- no included/purchased audit left
  end if;

  update clinics set deep_audit_credits = deep_audit_credits - 1 where id = p_clinic_id;

  insert into audit_runs (clinic_id, status, credits_spent)
    values (p_clinic_id, 'queued', 0)
    returning id into v_run;

  -- Attribution-only ledger row (delta 0), for cost/margin tracking as before.
  insert into credit_ledger (clinic_id, kind, delta, reason, balance_after, related_id, created_by)
    values (p_clinic_id, 'map', 0, 'audit_deep', coalesce(v_bal, 0), v_run, auth.uid());

  return v_run;
end;
$$;
revoke execute on function open_deep_audit(uuid) from public, anon, authenticated;
grant  execute on function open_deep_audit(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. start_deep_audit — session entry point (no args now). Resolves the caller's
--    clinic and delegates to the core. Drops the old (integer) allowance form.
-- ---------------------------------------------------------------------------
drop function if exists start_deep_audit(integer);

create or replace function start_deep_audit()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid;
begin
  v_clinic := current_clinic_id();
  if v_clinic is null then raise exception 'no clinic for current user'; end if;
  return open_deep_audit(v_clinic);
end;
$$;
revoke execute on function start_deep_audit() from public, anon;
grant  execute on function start_deep_audit() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Refund a consumed credit when a run fails at discovery (nothing delivered).
--    Idempotent via audit_runs.slot_released. Session form (ownership-checked)
--    for the manual path; run-scoped form for the cron (derives clinic, no
--    session).
-- ---------------------------------------------------------------------------
create or replace function release_deep_audit(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid;
begin
  v_clinic := current_clinic_id();
  if v_clinic is null then raise exception 'no clinic for current user'; end if;

  with released as (
    update audit_runs set slot_released = true
     where id = p_run_id and clinic_id = v_clinic and slot_released = false
     returning clinic_id
  )
  update clinics c set deep_audit_credits = deep_audit_credits + 1
    from released where c.id = released.clinic_id;
end;
$$;
revoke execute on function release_deep_audit(uuid) from public, anon;
grant  execute on function release_deep_audit(uuid) to authenticated;

create or replace function release_deep_audit_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  with released as (
    update audit_runs set slot_released = true
     where id = p_run_id and slot_released = false
     returning clinic_id
  )
  update clinics c set deep_audit_credits = deep_audit_credits + 1
    from released where c.id = released.clinic_id;
end;
$$;
revoke execute on function release_deep_audit_run(uuid) from public, anon, authenticated;
grant  execute on function release_deep_audit_run(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Register this migration.
-- ---------------------------------------------------------------------------
insert into applied_migrations (version, name) values
  ('040','deep_audit_credit_billing')
on conflict (version) do nothing;
