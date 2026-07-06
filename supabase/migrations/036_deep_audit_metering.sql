-- ============================================================
-- GrowthOS — migration 036: Deep Audit metering + pipeline cursor
--
-- Companion to 035 (the Deep Audit schema). This wires the RUN model:
--   * Billing: deep audits are NOT charged in shared map credits. Each clinic
--     gets a per-cycle allowance (default 2) tracked on clinics.
--     deep_audits_used_this_cycle, consumed atomically by start_deep_audit().
--     Every run still writes a delta-0 credit_ledger row (reason 'audit_deep')
--     purely for cost attribution / margin tracking (A3). "Buy extra audit"
--     (₹1,000) is a later step — this migration only meters the free allowance.
--   * Resumability: audit_runs gains stage_cursor (last completed stage key) so
--     the runAuditStage server action can resume the failed/next stage instead
--     of restarting a fragile monolith. est_api_cost_inr logs the run's API
--     spend estimate; slot_released guards the give-back on a failed run.
--   * Seeds metric_definitions.review_velocity_computed (Stage 2 writes a derived
--     velocity signal against it; audit_signals.metric_key FKs this table).
--
-- CYCLE RESET: no generic monthly-reset job exists (the credit model is
-- balance-based), so the allowance self-resets on a rolling 1-month window
-- anchored at the cycle's first audit. TODO: re-anchor to the exact billing
-- renewal date (current_period_end) once the payment gateway is live.
--
-- Additive + idempotent. Requires 001 (clinics, current_clinic_id), 019
-- (map_credits_balance, credit_ledger), 020 (reason constraint), 035 (audit_runs,
-- metric_definitions), 031 (applied_migrations).
-- Run in the Supabase SQL editor, then: notify pgrst, 'reload schema';
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Allow the 'audit_deep' ledger reason (attribution-only, delta 0).
--    Re-declares the full set (mirrors 020's swap) + the new reason.
-- ---------------------------------------------------------------------------
alter table credit_ledger drop constraint if exists credit_ledger_reason_check;
alter table credit_ledger add constraint credit_ledger_reason_check
  check (reason in
    ('trial_grant','topup','generation','map_scan','admin_adjust',
     'monthly_reset','refund','audit_deep'));

-- ---------------------------------------------------------------------------
-- 2. Per-clinic deep-audit allowance counter (NOT client-writable — 019's
--    column-lock already forbids blanket UPDATE, and we add no grant here, so
--    only the SECURITY DEFINER functions below can move these).
-- ---------------------------------------------------------------------------
alter table clinics add column if not exists deep_audits_used_this_cycle integer not null default 0;
alter table clinics add column if not exists deep_audits_cycle_start     timestamptz;

-- ---------------------------------------------------------------------------
-- 3. audit_runs — pipeline cursor + cost log + slot-release guard.
-- ---------------------------------------------------------------------------
alter table audit_runs add column if not exists stage_cursor    text;
alter table audit_runs add column if not exists est_api_cost_inr numeric not null default 0;
alter table audit_runs add column if not exists slot_released   boolean not null default false;

-- ---------------------------------------------------------------------------
-- 4. Seed the derived velocity metric (Stage 2). vertical NULL = shared pool.
-- ---------------------------------------------------------------------------
insert into metric_definitions
  (metric_key, display_name, moat_key, source, value_type, enum_options, rubric)
values
  ('review_velocity_computed', 'Review Velocity (Computed)', 'market_activity', 'places', 'number', null, null)
on conflict (metric_key) do update set
  display_name = excluded.display_name,
  moat_key     = excluded.moat_key,
  source       = excluded.source,
  value_type   = excluded.value_type,
  is_active    = excluded.is_active;

-- ---------------------------------------------------------------------------
-- 5. start_deep_audit — atomically consume one allowance slot and open a run.
--    Returns the new audit_runs id, or NULL when the cycle allowance is spent
--    (caller shows an upsell). Row-locks the clinic so two concurrent starts
--    can't both slip past the cap. Writes the attribution-only ledger row.
-- ---------------------------------------------------------------------------
create or replace function start_deep_audit(p_limit integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid;
  v_used   integer;
  v_start  timestamptz;
  v_bal    integer;
  v_run    uuid;
begin
  if p_limit is null or p_limit < 0 then
    raise exception 'invalid deep audit limit';
  end if;

  v_clinic := current_clinic_id();
  if v_clinic is null then
    raise exception 'no clinic for current user';
  end if;

  select deep_audits_used_this_cycle, deep_audits_cycle_start, map_credits_balance
    into v_used, v_start, v_bal
    from clinics where id = v_clinic
    for update;

  -- Roll the monthly window (reset one month after the cycle's first audit).
  if v_start is null or now() >= v_start + interval '1 month' then
    v_used  := 0;
    v_start := now();
  end if;

  if v_used >= p_limit then
    return null;                              -- allowance exhausted this cycle
  end if;

  update clinics
     set deep_audits_used_this_cycle = v_used + 1,
         deep_audits_cycle_start     = v_start
   where id = v_clinic;

  insert into audit_runs (clinic_id, status, credits_spent)
    values (v_clinic, 'queued', 0)
    returning id into v_run;

  -- Attribution-only: logs the run without touching the balance (delta 0).
  insert into credit_ledger (clinic_id, kind, delta, reason, balance_after, related_id, created_by)
    values (v_clinic, 'map', 0, 'audit_deep', coalesce(v_bal, 0), v_run, auth.uid());

  return v_run;
end;
$$;

revoke execute on function start_deep_audit(integer) from public, anon;
grant  execute on function start_deep_audit(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. release_deep_audit — give the allowance slot back for a FAILED run, once.
--    Idempotent via audit_runs.slot_released: the CTE flips the flag (only if
--    still false) and only then decrements, so a double-call can't over-credit.
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
  if v_clinic is null then
    raise exception 'no clinic for current user';
  end if;

  with released as (
    update audit_runs set slot_released = true
     where id = p_run_id and clinic_id = v_clinic and slot_released = false
     returning clinic_id
  )
  update clinics c
     set deep_audits_used_this_cycle = greatest(0, c.deep_audits_used_this_cycle - 1)
    from released
   where c.id = released.clinic_id;
end;
$$;

revoke execute on function release_deep_audit(uuid) from public, anon;
grant  execute on function release_deep_audit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Register this migration.
-- ---------------------------------------------------------------------------
insert into applied_migrations (version, name) values
  ('036','deep_audit_metering')
on conflict (version) do nothing;
