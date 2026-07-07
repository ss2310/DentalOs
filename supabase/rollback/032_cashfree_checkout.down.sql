-- rollback for 032_cashfree_checkout.sql
-- Reverses the schema/DDL. Note: the billing_provider backfill (manual→cashfree)
-- is NOT reversed — there's no record of which rows were 'manual' before — but the
-- column DEFAULT is restored to 'manual'.

drop function if exists start_cashfree_checkout(text, uuid, text);
drop table if exists pending_payments;

alter table clinics alter column billing_provider set default 'manual';

delete from applied_migrations where version = '032';
