-- ============================================================
-- GrowthOS — migration 029: one clinic per phone number
--
-- Data-integrity backstop for signup. The app already rejects a duplicate phone
-- with a friendly error (signup/actions.ts), but that check-then-insert can race;
-- this partial unique index is the hard guarantee at the DB level.
--
-- ⚠️ PRECONDITION: there must be NO existing duplicate non-null phones. If the DB
-- already has duplicates (test data), this CREATE INDEX will fail — resolve the
-- duplicates first (rename/merge/delete the extras). Query to find them:
--
--   select phone, count(*), array_agg(business_name)
--   from clinics where phone is not null
--   group by phone having count(*) > 1;
--
-- Partial (phone is not null) so legacy/blank rows don't collide.
-- IDEMPOTENT: create-if-not-exists.
-- ============================================================

create unique index if not exists uq_clinics_phone
  on clinics (phone)
  where phone is not null;
