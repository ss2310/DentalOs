-- ============================================================
-- GrowthOS — ROLLBACK for migration 027_clinic_vertical_setter
--
-- ⚠️ DOWN script, NOT a forward migration — kept OUTSIDE supabase/migrations/ so
-- a runner never applies it as a forward step. Run ONLY to undo 027, by pasting
-- it into the Supabase SQL Editor.
--
-- Drops the setter function. Idempotent (drop … if exists). Touches nothing else.
-- ============================================================

drop function if exists set_clinic_vertical(text);
