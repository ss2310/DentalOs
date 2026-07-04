-- ============================================================
-- GrowthOS — migration 027: clinic self-serve vertical setter (ADD-ONLY)
--
-- Migration 019 column-locked `clinics`: authenticated may UPDATE only a fixed
-- list of settings columns, and `vertical` (added in 026) is deliberately NOT in
-- it — so a clinic owner can't change it with a direct RLS UPDATE. But the
-- multi-vertical Settings dropdown needs to let an owner pick their vertical.
--
-- This adds a SECURITY DEFINER function that sets ONLY `clinics.vertical` for the
-- caller's OWN clinic, after checking the caller is an owner/doctor and that the
-- target vertical exists AND is active. It can neither cross a tenant boundary
-- nor set an unknown/inactive vertical. Onboarding keeps setting `vertical` via
-- the service-role client (which bypasses the lock) — this is only for Settings.
--
-- Reverse with: supabase/rollback/027_clinic_vertical_setter.down.sql
-- Requires 013 (is_clinic_admin), 026 (verticals, clinics.vertical).
-- Additive + idempotent. Run in the Supabase SQL Editor.
-- ============================================================

create or replace function set_clinic_vertical(p_vertical text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := current_clinic_id();
begin
  if v_clinic is null then
    raise exception 'no clinic for caller';
  end if;
  if not is_clinic_admin() then
    raise exception 'only an owner or doctor can change the vertical';
  end if;
  if not exists (
    select 1 from verticals where id = p_vertical and is_active
  ) then
    raise exception 'unknown or inactive vertical: %', p_vertical;
  end if;

  update clinics set vertical = p_vertical where id = v_clinic;
end;
$$;

revoke execute on function set_clinic_vertical(text) from public, anon;
grant  execute on function set_clinic_vertical(text) to authenticated;
