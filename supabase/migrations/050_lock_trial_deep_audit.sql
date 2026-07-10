-- ============================================================
-- GrowthOS — migration 050: Deep Audit is not a free-trial feature
--
-- Each deep audit costs us ~₹100 in API spend (migration 047 economics). The
-- free trial was handing every signup one for free (clinics.deep_audit_credits
-- DEFAULT 1, migration 040), which bleeds money as soon as paid ads point
-- strangers at signup. This closes that:
--   * New clinics start with 0 audit credits (column default → 0). The signup
--     action (app/signup/actions.ts) also sets it explicitly, so the two agree
--     even on a mid-rollout deploy.
--   * The paid paths are UNCHANGED: upgrading to Growth still grants 1 audit per
--     period (apply_plan_purchase), and the ₹599 "Deep Audit Top-up" still
--     grants +1 (apply_pack_purchase). A trial clinic can still BUY an audit.
--
-- NOT retroactive on purpose. Existing trial clinics keep whatever balance they
-- hold — a blanket `update ... where subscription_status='trial'` would also
-- zero a trial clinic that PAID ₹599 for a top-up (a pack purchase doesn't flip
-- the trial status), confiscating a paid audit. Pre-revenue that's only the
-- owner's own test accounts; zero those by hand from /admin or a targeted update
-- if desired. This migration only changes the default for FUTURE signups.
--
-- Additive + idempotent. Requires 040 (deep_audit_credits column). Run in the
-- Supabase SQL editor, then: notify pgrst, 'reload schema';
-- ============================================================

alter table clinics alter column deep_audit_credits set default 0;

insert into applied_migrations (version, name) values
  ('050','lock_trial_deep_audit')
on conflict (version) do nothing;

notify pgrst, 'reload schema';
