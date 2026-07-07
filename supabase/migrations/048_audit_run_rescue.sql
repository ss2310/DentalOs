-- ============================================================
-- GrowthOS — migration 048: deep-audit run rescue (safe to close the tab)
--
-- Manual audit runs are driven by the browser (one stage per server action).
-- Closing the tab used to strand the run mid-pipeline forever — the consumed
-- credit produced nothing. Fix: every stage start stamps stage_started_at,
-- and the deep-audit-runner cron (every 2 min) now also picks up MANUAL runs
-- whose stamp is >8 minutes old (a live browser stage can never be older
-- than the 5-minute function cap, so 8 minutes = genuinely abandoned) and
-- finishes them server-side. Runs stalled >24h are marked failed, with the
-- credit refunded when discovery never completed (the existing policy).
--
-- Existing stuck rows: the column default stamps them at migration time, so
-- they become rescuable 8 minutes after this runs — no manual repair needed.
--
-- Additive + idempotent. Requires 035 (audit_runs).
-- Run in the Supabase SQL editor, then: notify pgrst, 'reload schema';
-- ============================================================

alter table audit_runs add column if not exists stage_started_at timestamptz not null default now();

-- The runner polls this every 2 minutes — index the probe.
create index if not exists audit_runs_rescue_idx
  on audit_runs (status, trigger, stage_started_at);

insert into applied_migrations (version, name) values
  ('048','audit_run_rescue')
on conflict (version) do nothing;
