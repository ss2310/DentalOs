-- Rollback for migration 028 — drop prospect_audits.vertical.
-- Kept OUT of supabase/migrations/ on purpose (a *.down.sql there would sort
-- before the up migration and run first). Apply by hand only to reverse 028.

alter table prospect_audits drop column if exists vertical;
