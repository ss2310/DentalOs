-- ============================================================
-- GrowthOS — migration 041: recurring Deep Audit (30-day cycle)
--
-- Columns for the daily orchestrator + runner (app/api/cron/deep-audit*):
--   * audit_runs.trigger        — 'manual' (browser-driven) | 'auto' (cron-driven).
--                                 The runner only advances 'auto' runs.
--   * audit_runs.digest_sent_at — one "what moved" delta digest per completed run.
--   * audit_plans.mid_plan_nudge_sent_at — one mid-plan stall nudge per plan.
--   * clinics.reaudit_nudge_sent_at      — one "audit due / top-up" nudge per due
--                                 window (cleared when a fresh run completes).
-- All anti-duplicate stamps follow the existing *_sent_at reminder pattern.
--
-- Additive + idempotent. Requires 035 (audit_runs, audit_plans), 001 (clinics).
-- Run in the Supabase SQL editor, then: notify pgrst, 'reload schema';
-- ============================================================

alter table audit_runs  add column if not exists trigger        text not null default 'manual';
alter table audit_runs  drop constraint if exists audit_runs_trigger_check;
alter table audit_runs  add constraint audit_runs_trigger_check check (trigger in ('manual','auto'));
alter table audit_runs  add column if not exists digest_sent_at   timestamptz;
-- Pre-composed Hinglish message the report renders as a one-tap "Send on
-- WhatsApp" button (the notification carries the same text + the in-app link).
alter table audit_runs  add column if not exists digest_wa_message text;

alter table audit_plans add column if not exists mid_plan_nudge_sent_at   timestamptz;
alter table audit_plans add column if not exists mid_plan_nudge_wa_message text;

alter table clinics     add column if not exists reaudit_nudge_sent_at  timestamptz;

-- Fast "clinics whose latest completed run is ≥30 days old" lookups.
create index if not exists idx_audit_runs_clinic_complete
  on audit_runs (clinic_id, completed_at)
  where status = 'complete';

-- The recurring engine (cron routes + delta digest) creates notifications with
-- the SERVICE-ROLE client; 004 granted create_notification only to authenticated.
grant execute on function create_notification(
  uuid, notification_type, notification_priority, text, text, text, uuid, uuid, user_role
) to service_role;

insert into applied_migrations (version, name) values
  ('041','deep_audit_recurring')
on conflict (version) do nothing;
