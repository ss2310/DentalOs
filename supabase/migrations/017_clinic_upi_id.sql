-- 017_clinic_upi_id.sql
-- UPI Payment Links: store the clinic's own UPI VPA so /billing can build
-- upi://pay deep links for patients to settle balances. One nullable column;
-- confirmation stays MANUAL (no webhook / auto-reconciliation).
--
-- Idempotent: add-column-if-not-exists. Requires 001_init.sql (clinics table).

alter table clinics
  add column if not exists upi_id text;
