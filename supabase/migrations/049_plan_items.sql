-- ============================================================
-- GrowthOS — migration 049: itemized treatment plans
--
-- A case_pipeline row used to hold ONE treatment_id + one value, so staff
-- had to create a separate case per treatment to represent a real plan
-- (e.g. RCT + crown + extraction). Now one case IS the whole plan:
--
--   plan_items jsonb — [{ treatment_id, name, qty, price }, ...]
--     * name is denormalized so lists render without an N-way join.
--     * plan_value stays the authoritative total (summed server-side).
--     * treatment_id keeps pointing at the FIRST item, so every existing
--       display, join, and wa.me follow-up message keeps working.
--     * NULL = legacy single-treatment case (rendering falls back to the
--       treatment_id join, unchanged).
--
-- Additive + idempotent. Requires 001 (case_pipeline).
-- Run in the Supabase SQL editor, then: notify pgrst, 'reload schema';
-- ============================================================

alter table case_pipeline add column if not exists plan_items jsonb;

insert into applied_migrations (version, name) values
  ('049','plan_items')
on conflict (version) do nothing;
