-- ============================================================
-- GrowthOS — migration 025: voice-notes clinic self-serve toggle + RLS re-verify
--
-- Migration 019 column-locked `clinics`: it revoked blanket UPDATE from
-- `authenticated` and re-granted only the 13 settings/location columns, so
-- `feature_flags` is intentionally NOT client-writable (a clinic must not be able
-- to grant itself paid features). But we DO want a clinic owner/doctor to flip
-- their OWN `voice_notes` bit from Settings.
--
-- This migration adds a SECURITY DEFINER function that flips ONLY the
-- `voice_notes` key for the caller's own clinic — leaving the column-lock and
-- every other flag untouched. It also re-asserts RLS on the voice-notes tables
-- as a standing verification that they stay clinic-scoped.
--
-- ADDITIVE + IDEMPOTENT. Requires 013 (is_clinic_admin), 018 (feature_flags),
-- 023 (clinic_notes, followup_tasks), 024 (agent_audit).
-- ============================================================

-- ------------------------------------------------------------
-- 1. set_voice_notes_enabled — clinic self-serve toggle
-- ------------------------------------------------------------
-- SECURITY DEFINER so it can write feature_flags (which authenticated can't
-- update directly). It derives the clinic from the session, requires the caller
-- to be an owner/doctor of that clinic, and only ever sets the single
-- `voice_notes` key — so it can neither cross a tenant boundary nor let a clinic
-- toggle any other (paid) flag.
create or replace function set_voice_notes_enabled(p_enabled boolean)
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
    raise exception 'only an owner or doctor can change this setting';
  end if;

  update clinics
     set feature_flags = jsonb_set(
           coalesce(feature_flags, '{}'::jsonb),
           '{voice_notes}',
           to_jsonb(p_enabled),
           true
         )
   where id = v_clinic;
end;
$$;

revoke execute on function set_voice_notes_enabled(boolean) from public, anon;
grant  execute on function set_voice_notes_enabled(boolean) to authenticated;

-- ------------------------------------------------------------
-- 2. RLS re-verify (defensive, idempotent)
-- ------------------------------------------------------------
-- Every voice-notes table must stay clinic-scoped: a clinic user sees only their
-- own clinic's rows. These tables were created with clinic-scoped policies in
-- 023/024; re-assert RLS is enabled + forced so a future accidental disable is
-- caught here. (Policies themselves are unchanged.)
alter table clinic_notes    enable row level security;
alter table clinic_notes    force  row level security;
alter table followup_tasks  enable row level security;
alter table followup_tasks  force  row level security;
alter table agent_audit     enable row level security;
alter table agent_audit     force  row level security;
