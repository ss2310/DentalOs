-- ============================================================
-- GrowthOS — migration 039: widen the growth plan to 30 days
--
-- The deep-audit deliverable moved from a 15-day to a 30-day action plan
-- (Stage 6 now emits 16–20 items paced across four weeks). The 035 CHECK capped
-- plan_items.day_number at 1–15, which rejected every day 16–30 item. Widen it.
--
-- Additive + idempotent. Requires 035 (plan_items). Run in the Supabase SQL
-- editor, then: notify pgrst, 'reload schema';
-- ============================================================

alter table plan_items drop constraint if exists plan_items_day_number_check;
alter table plan_items
  add constraint plan_items_day_number_check check (day_number between 1 and 30);

insert into applied_migrations (version, name) values
  ('039','plan_items_30_day')
on conflict (version) do nothing;
