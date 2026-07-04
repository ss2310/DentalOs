-- ============================================================
-- GrowthOS — 014: lock down profile privilege escalation
--
-- Closes SEC-C1 (self-promotion / cross-tenant takeover via UPDATE on
-- own profiles row), SEC-C2 (signup metadata forging authz), and SEC-L4
-- (cross-clinic notification targeting). DB-level fix — app code alone
-- cannot patch RLS/grants.
--
-- ⚠️ SHIP WITH THE APP CHANGE: after this migration the signup trigger
-- reads role + home_clinic_id from raw_app_meta_data (service-role only),
-- NOT raw_user_meta_data. The server-side createUser calls in
-- signup/actions.ts and staff-actions.ts must pass these via app_metadata
-- or new signups become receptionists with no clinic.
--
-- IDEMPOTENT: re-runnable.
-- ============================================================

-- ------------------------------------------------------------
-- 1. SEC-C1 — column-scoped UPDATE on profiles
-- ------------------------------------------------------------
-- The profiles_update RLS policy (id = auth.uid()) only restricts WHICH
-- ROW you may touch, not WHICH COLUMNS. Supabase grants `authenticated`
-- table-level UPDATE by default, so a user can set role='clinic_owner'
-- (self-promote) or home_clinic_id='<victim>' (cross-tenant takeover) on
-- their own row. Fix: revoke the blanket UPDATE and re-grant only the two
-- safe, self-editable columns. role, home_clinic_id, is_agency are
-- deliberately excluded — those change only via the service role.
revoke update on public.profiles from authenticated;
grant update (full_name, unread_notification_count)
  on public.profiles to authenticated;

-- Keep the row filter as-is (documented here; unchanged from 001).
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ------------------------------------------------------------
-- 2. SEC-C2 — trigger trusts only service-role app_metadata
-- ------------------------------------------------------------
-- raw_app_meta_data is settable ONLY by the service-role admin API, never
-- by the public GoTrue signup endpoint. So role + clinic linkage are read
-- from there; anything in raw_user_meta_data (attacker-controlled on a
-- self-serve signup) is ignored. full_name stays from user metadata — it's
-- cosmetic and carries no authz. is_agency is never set here (defaults
-- false); agency status is granted later via the service role.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role        user_role;
  v_home_clinic uuid;
begin
  v_role := coalesce(
    (new.raw_app_meta_data ->> 'role')::user_role,
    'receptionist'
  );
  v_home_clinic := nullif(new.raw_app_meta_data ->> 'home_clinic_id', '')::uuid;

  insert into profiles (id, full_name, role, home_clinic_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    v_role,
    v_home_clinic
  );
  return new;
end;
$$;

-- trigger definition unchanged; re-assert for re-runnability
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ------------------------------------------------------------
-- 3. SEC-L4 — notifications can't target another clinic's user
-- ------------------------------------------------------------
-- Old policy only checked clinic_id = current_clinic_id(). Also require a
-- given target_user_id to belong to that same clinic. (The create_notification
-- RPC is SECURITY DEFINER and bypasses this; there are no direct authenticated
-- inserts today — this is defense-in-depth.) Same-clinic profiles are visible
-- under profiles_select, so the EXISTS resolves.
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert to authenticated
  with check (
    clinic_id = current_clinic_id()
    and (
      target_user_id is null
      or exists (
        select 1 from public.profiles p
        where p.id = notifications.target_user_id
          and p.home_clinic_id = notifications.clinic_id
      )
    )
  );
