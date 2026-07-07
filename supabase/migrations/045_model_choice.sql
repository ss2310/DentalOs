-- ============================================================
-- GrowthOS — migration 045: Content Studio model choice
--
-- The /generate Content Studio now lets clinics pick which AI writes each
-- piece (Claude — default / ChatGPT / Gemini; config + credit surcharges in
-- lib/models.ts). This records which model produced a saved draft so /history
-- can show it and future quality comparisons have data.
--
-- Additive + idempotent. Requires 001 (generated_content).
-- Run in the Supabase SQL editor, then: notify pgrst, 'reload schema';
-- ============================================================

-- NULL = generated before this migration (all-Claude era) or unknown.
alter table generated_content add column if not exists model_used text;

insert into applied_migrations (version, name) values
  ('045','model_choice')
on conflict (version) do nothing;
