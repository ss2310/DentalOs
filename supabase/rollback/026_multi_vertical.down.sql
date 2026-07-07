-- ============================================================
-- GrowthOS — ROLLBACK for migration 026_multi_vertical
--
-- ⚠️ This is a DOWN script, NOT a forward migration. It lives OUTSIDE
-- supabase/migrations/ on purpose: a migration runner (e.g. `supabase db push`)
-- applies every .sql in that folder as a forward step, and a "…down.sql" name
-- sorts BEFORE "…​.sql" — so keeping it there would run the rollback first and
-- fail with `relation "verticals" does not exist`. Run this ONLY to undo 026,
-- by pasting it into the Supabase SQL Editor.
--
-- Cleanly reverses 026: removes ONLY what 026 added (the verticals table and the
-- new columns). It never touches any pre-existing column or row.
--
-- Fully idempotent — safe to run whether or not 026 was applied, and safe to run
-- twice. Order matters: drop the columns that FK-reference verticals FIRST (that
-- also drops their FK constraints), then drop the verticals table (which also
-- drops its RLS policy automatically — so we don't reference `verticals` by name
-- after it may already be gone).
-- ============================================================

-- 1. Drop the added columns (each drop also removes its FK to verticals).
alter table if exists topic_suggestions drop column if exists vertical;
alter table if exists post_types        drop column if exists vertical;
alter table if exists clinics           drop column if exists vertical;

-- 2. Drop the verticals catalog. DROP TABLE removes the RLS policy with it, so we
--    never issue a `... on verticals` statement that would error once it's gone.
drop table if exists verticals;
