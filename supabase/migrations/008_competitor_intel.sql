-- ============================================================
-- GrowthOS — migration 008: competitor intelligence
--
-- The Grid Rank Tracker (007) already fetches the top ~10 local results at
-- every grid point during a scan. This migration adds one column to hold the
-- competitor aggregate we compute from those results at scan time, so the
-- clinic-facing /competitors feature reads pre-computed data and makes NO
-- additional SERP API calls (zero extra cost).
--
-- Additive + idempotent, same as 007. rank_scans is already clinic-scoped
-- under RLS (see 007 §5), so a new column needs no extra policy.
-- ============================================================

-- Competitor aggregate for this scan. Shape (built by lib/serp/competitors.ts):
--   { total_cells, target:{avg_rank,reviews_count,rating,has_website,top3_cells},
--     rivals:[{name,avg_rank,reviews_count,rating,has_website,
--              cells_beating_target,cells_present,top3_cells}],
--     total_top3_slots, cells:[{lat,lng,your_rank,leader_name,state}] }
-- NULL on scans created before this migration (they predate the aggregate).
alter table rank_scans add column if not exists competitors jsonb;
