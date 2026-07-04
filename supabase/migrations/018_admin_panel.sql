-- 018_admin_panel.sql
-- Foundation for the internal PLATFORM-OWNER admin panel at /admin. This is NOT
-- a clinic feature — it is cross-tenant and must be unreachable by any clinic
-- user. Admin identity is profiles.is_super_admin + is_super_admin(); there is
-- NO separate platform_admins table.
--
-- What this adds:
--   * is_super_admin flag + helper (self-contained; also declared in 019 — both
--     idempotent, so this file stands alone whatever order it runs in)
--   * clinics.vertical + clinics.feature_flags  (surfaced/edited in the panel)
--   * admin_audit                                (every admin action logged; A3 viewer)
--   * admin_clinics_overview()                   (cross-tenant list; service role only)
--
-- The panel's access control lives in app code: middleware + every admin route/
-- action independently call is_super_admin(), and cross-tenant reads use the
-- service-role client ONLY inside those admin-verified handlers.
--
-- Idempotent. Requires only 001 (clinics, profiles). Intentionally does NOT
-- reference the subscription columns added in 019, so it is order-independent.

-- ---------------------------------------------------------------------------
-- 0. Super-admin flag + helper (mirrors is_agency() from 007)
-- ---------------------------------------------------------------------------
-- Also declared in 019; both are idempotent (add-if-not-exists / create-or-
-- replace), so whichever runs first wins and re-running is a no-op. Kept here so
-- this migration is self-contained and safe at number 018 regardless of 019.
alter table profiles
  add column if not exists is_super_admin boolean not null default false;

create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_super_admin from profiles where id = auth.uid()), false);
$$;

revoke execute on function is_super_admin() from public;
grant execute on function is_super_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Clinic columns surfaced in the panel
-- ---------------------------------------------------------------------------
-- Single vertical today (dental); stored so the cross-tenant view is honest and
-- future verticals slot in without another migration.
alter table clinics
  add column if not exists vertical text not null default 'dental';
-- Per-clinic feature toggles, editable from the admin clinic detail page. A flag
-- is "on" only when present and true. Enforcement wiring across the app is
-- deliberately out of scope for this foundation.
alter table clinics
  add column if not exists feature_flags jsonb not null default '{}'::jsonb;

-- NOTE: vertical + feature_flags must never be client-writable. Migration 019's
-- clinics UPDATE column-lock (revoke blanket UPDATE, re-grant only the settings/
-- booking columns) already excludes them, so only the service role / definer
-- functions can change them. If 019 has not been applied yet, apply it — until
-- then a clinic owner could still edit these two columns.

-- ---------------------------------------------------------------------------
-- 2. admin_audit — append-only log of admin actions. No client writes.
-- ---------------------------------------------------------------------------
create table if not exists admin_audit (
  id            uuid primary key default gen_random_uuid(),
  admin_user_id uuid references auth.users (id) on delete set null,
  action        text not null,
  target_type   text,
  target_id     text,
  details       jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_admin_audit_created on admin_audit (created_at desc);

alter table admin_audit enable row level security;
alter table admin_audit force row level security;
-- Super admins may READ the log (the A3 viewer); writes go through the service
-- role inside admin-verified handlers. No insert/update/delete policies.
drop policy if exists admin_audit_select on admin_audit;
create policy admin_audit_select on admin_audit for select to authenticated
  using (is_super_admin());

-- ---------------------------------------------------------------------------
-- 3. admin_clinics_overview() — cross-tenant clinic list for the panel.
-- ---------------------------------------------------------------------------
-- Aggregates user count + last activity per clinic in SQL (no N+1, no PostgREST
-- row-limit truncation). Returns ONLY base + this-migration columns so it never
-- depends on 019; the app enriches each row with subscription fields via a
-- direct service-role select. Callable ONLY by the service role, which the app
-- uses exclusively inside admin-verified handlers — so it never reaches a clinic
-- session even though it crosses tenants.
create or replace function admin_clinics_overview()
returns table (
  id            uuid,
  business_name text,
  vertical      text,
  created_at    timestamptz,
  is_active     boolean,
  feature_flags jsonb,
  user_count    bigint,
  last_activity timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.business_name,
    c.vertical,
    c.created_at,
    c.is_active,
    c.feature_flags,
    (select count(*) from profiles p where p.home_clinic_id = c.id) as user_count,
    greatest(
      (select max(gc.created_at) from generated_content gc where gc.clinic_id = c.id),
      (select max(rs.scanned_at)  from rank_scans rs       where rs.clinic_id = c.id)
    ) as last_activity
  from clinics c
  order by c.created_at desc;
$$;

revoke execute on function admin_clinics_overview() from public, anon, authenticated;
grant execute on function admin_clinics_overview() to service_role;
