-- ============================================================
-- GrowthOS — migration 011: subscription plan on clinics
--
-- Adds a coarse `plan` tier to clinics so the hosted-landing-pages feature can
-- enforce a PER-PLAN cap on how many pages a clinic may publish (see
-- lib/plans.ts for the plan → limit map). This is intentionally minimal — a
-- single text tier, NOT a full billing system. Like profiles.is_agency (007),
-- the tier is set manually on the clinic row for now; real self-serve billing
-- is a future feature.
--
-- Hosted landing pages are subdomain-hosted v1 (served at /p/<booking_slug>/<slug>);
-- custom-domain mapping is a future feature and is deliberately NOT built.
--
-- Additive + idempotent. Run in the Supabase SQL Editor (postgres bypasses RLS).
-- ============================================================

-- 'free' | 'starter' | 'pro' | 'agency'. Default 'starter' so existing clinics
-- get a sensible non-zero page allowance without a data backfill.
alter table clinics
  add column if not exists plan text not null default 'starter';
