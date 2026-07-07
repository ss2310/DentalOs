-- Rollback 030_plan_pack_admin.sql
-- Restores the original billing_events shape. ⚠️ Only safe if no rows use the
-- new event types or a null clinic_id — delete/repair those first, or the
-- NOT NULL / CHECK re-add will fail.

-- Remove any platform-level pricing rows (they have no clinic_id).
delete from billing_events
 where event_type in ('plan_price_changed','pack_price_changed')
    or clinic_id is null;

-- Restore NOT NULL on clinic_id.
alter table billing_events alter column clinic_id set not null;

-- Restore the original event_type CHECK (without the two pricing types).
alter table billing_events drop constraint if exists billing_events_event_type_check;
alter table billing_events add constraint billing_events_event_type_check
  check (event_type in (
    'trial_started','payment_received','plan_changed','past_due',
    'deactivated','reactivated','topup'
  ));
