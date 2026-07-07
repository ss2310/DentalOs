-- 030_plan_pack_admin.sql
-- Admin plan & pack management (A2). Lets the super-admin edit plan/pack prices,
-- credits, and activation from /admin/plans, and records every PRICE change to
-- billing_events for an audit trail.
--
-- Two changes to billing_events so it can hold platform-level pricing events:
--   1. Two new event_type values: 'plan_price_changed' / 'pack_price_changed'.
--   2. clinic_id becomes NULLABLE — a pricing change is platform-wide, not tied
--      to one clinic. All existing readers are safe: the admin pending list
--      filters status='pending' (pricing rows are 'confirmed'), and the clinic
--      detail page filters clinic_id = <that clinic>, so a null-clinic row never
--      surfaces where a clinic is assumed.
--
-- Idempotent: guarded constraint swap + drop-not-null (a no-op if already null).
-- Requires 019 (plans, credit_packs, billing_events) + 020 (event status column).
-- ⚠️ DDL — run by hand in the Supabase SQL editor (PostgREST can't run DDL).

-- 1. Allow the two pricing event types alongside the existing set.
alter table billing_events drop constraint if exists billing_events_event_type_check;
alter table billing_events add constraint billing_events_event_type_check
  check (event_type in (
    'trial_started','payment_received','plan_changed','past_due',
    'deactivated','reactivated','topup',
    'plan_price_changed','pack_price_changed'
  ));

-- 2. Platform-level pricing events have no clinic.
alter table billing_events alter column clinic_id drop not null;
