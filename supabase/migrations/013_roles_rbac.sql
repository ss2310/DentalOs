-- ============================================================
-- GrowthOS — 013: role-based access (RBAC)
--
-- profiles.role already exists (see 001_init.sql: enum user_role =
-- clinic_owner | doctor | receptionist) — NO new column here. This
-- migration adds the RLS role helpers and tightens the highest-value
-- writes (clinic settings + rate-card pricing) to the owner/doctor tier.
--
-- Enforcement is layered (see the RBAC plan): nav filter (UX) + server
-- route/action guards (lib/roles.ts) + these RLS policies (the DB-level
-- backstop, per CLAUDE.md rule #1 "not only application code").
--
-- IDEMPOTENT: create-or-replace functions; drop-if-exists policies.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ROLE HELPERS
-- ------------------------------------------------------------

-- Mirrors current_clinic_id(): the single source of truth for the
-- logged-in user's role. SECURITY DEFINER so it can read profiles
-- without recursing into profiles' own RLS.
create or replace function current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

revoke execute on function current_user_role() from public, anon;
grant execute on function current_user_role() to authenticated;

-- The "admin tier" = clinic owner or doctor. Receptionists are everyone
-- else. Mirrored by isAdminRole() in lib/roles.ts; keep the two in sync.
create or replace function is_clinic_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_user_role() in ('clinic_owner', 'doctor'), false);
$$;

revoke execute on function is_clinic_admin() from public, anon;
grant execute on function is_clinic_admin() to authenticated;

-- ------------------------------------------------------------
-- 2. TIGHTEN SENSITIVE WRITES TO THE ADMIN TIER
-- ------------------------------------------------------------
-- Reads stay clinic-scoped for EVERYONE (receptionists still read rate
-- cards when booking appointments / logging visits). Only writes are gated.
--
-- Staff management (creating/removing receptionist accounts) is done via
-- the service-role admin client, which bypasses RLS entirely — so no
-- profiles policy change is needed here.

-- clinics: only owner/doctor may edit clinic settings (name, credits,
-- plan, review URL, landing config, ...). The SELECT policy is unchanged.
drop policy if exists clinics_update on clinics;
create policy clinics_update on clinics for update to authenticated
  using (id = current_clinic_id() and is_clinic_admin())
  with check (id = current_clinic_id() and is_clinic_admin());

-- rate_cards: pricing is admin-only to write; SELECT stays open to the
-- whole clinic.
drop policy if exists rate_cards_insert on rate_cards;
create policy rate_cards_insert on rate_cards for insert to authenticated
  with check (clinic_id = current_clinic_id() and is_clinic_admin());
drop policy if exists rate_cards_update on rate_cards;
create policy rate_cards_update on rate_cards for update to authenticated
  using (clinic_id = current_clinic_id() and is_clinic_admin())
  with check (clinic_id = current_clinic_id() and is_clinic_admin());
drop policy if exists rate_cards_delete on rate_cards;
create policy rate_cards_delete on rate_cards for delete to authenticated
  using (clinic_id = current_clinic_id() and is_clinic_admin());
