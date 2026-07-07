-- ============================================================
-- GrowthOS — migration 038: Stage 4 auditability + error integrity
--
-- Closes two defects found in the ai_query_results evidence trail:
--
--   Break #2 (AUDITABILITY). The engine's raw answer was parsed to a verdict and
--     then DISCARDED — no column held it — so no self_cited verdict could ever be
--     checked against the text that produced it. We now persist the FULL raw
--     engine response per cell (answer_text + answer_sources) at insert time, so
--     every verdict is defensible forever against the words it was drawn from.
--     BACKFILL IS IMPOSSIBLE: rows written before this migration discarded the raw
--     text; they keep NULL answer_text / answer_sources. Only runs from here on
--     are auditable. (Accepted.)
--
--   Break #3 (ERROR INTEGRITY). An engine error/timeout was written as
--     self_cited=false — a FAILED measurement stored as a measured "no" — and
--     counted in the citation-rate denominator. Now: self_cited is NULLABLE
--     (NULL = "not measured"); status distinguishes a real 'ok' negative from an
--     'error' cell; error_detail records why; and a CHECK constraint makes it
--     IMPOSSIBLE to store an errored cell as a measured verdict (defence in depth
--     behind the single insert path). The rollup excludes errored cells from the
--     denominator and reports "X of N measured (M errored)".
--
--   MATCHER. matched_string records the EXACT clinic-name (or domain) string that
--     matched, so every positive can be justified when read next to answer_text.
--
-- Additive + idempotent. Requires 037 (ai_query_results). Run in the Supabase SQL
-- editor, then: notify pgrst, 'reload schema';
-- ============================================================

-- 1. Raw engine response (Break #2) + verdict provenance (Matcher).
alter table ai_query_results add column if not exists answer_text    text;   -- full raw engine answer ('' when the engine returned none)
alter table ai_query_results add column if not exists answer_sources jsonb;  -- raw engine sources [{ url, title }]
alter table ai_query_results add column if not exists matched_string text;   -- exact self-name/domain string that matched (NULL when not self_cited)

-- 2. Error integrity (Break #3).
alter table ai_query_results add column if not exists status       text not null default 'ok';  -- 'ok' | 'error'
alter table ai_query_results add column if not exists error_detail text;                          -- failure reason when status='error'

-- self_cited: NULL now means "not measured" (engine errored). false = measured &
-- not cited; true = measured & cited. Drop NOT NULL + default so a failed cell
-- can never fall back to a measured negative.
alter table ai_query_results alter column self_cited drop default;
alter table ai_query_results alter column self_cited drop not null;

-- Enforce the integrity rule at the schema level: an 'ok' cell MUST carry a
-- boolean verdict; an 'error' cell MUST carry NULL. A failed measurement is
-- therefore un-storable as a measured "no". (Pre-038 rows are status='ok' with a
-- boolean self_cited, so they already satisfy this.)
alter table ai_query_results drop constraint if exists ai_query_results_status_chk;
alter table ai_query_results add constraint ai_query_results_status_chk check (
  (status = 'ok'    and self_cited is not null) or
  (status = 'error' and self_cited is null)
);

-- 3. Register this migration.
insert into applied_migrations (version, name) values
  ('038','ai_query_results_auditability')
on conflict (version) do nothing;
