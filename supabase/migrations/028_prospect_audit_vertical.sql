-- ============================================================
-- GrowthOS — migration 028: prospect_audits.vertical (ADD-ONLY)
--
-- Lets an agency run a prospect audit for a NON-dental prospect so the audit's
-- AI-visibility query set + keyword suggestions read for that vertical instead
-- of dental. Purely additive:
--   * adds one nullable-with-default column (vertical) to prospect_audits,
--   * defaults to 'dental', so every existing + future dental audit is
--     byte-for-byte unchanged,
--   * FK to verticals(id) guarantees a known vertical.
--
-- No behaviour changes until the (flag-gated) agency vertical picker sets a
-- non-dental value. The app reads this column defensively (falls back to dental
-- if it isn't present yet), so applying this is safe at any time.
--
-- Reverse with: supabase/rollback/028_prospect_audit_vertical.down.sql
-- ============================================================

alter table prospect_audits
  add column if not exists vertical text not null default 'dental'
    references verticals (id);
