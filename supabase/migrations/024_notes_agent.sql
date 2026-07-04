-- ============================================================
-- GrowthOS — migration 024: voice-notes extraction agent
--
-- The extraction brain (lib/agent/notes-agent.ts) reads a transcript and
-- proposes structured operational follow-ups. This migration adds:
--   1. clinic_notes.extraction  — the STAGED proposal (cleaned note, tags,
--      follow-ups, recall, review flag) awaiting human Confirm. Nothing here is
--      committed to followup_tasks / recalls until confirmNote() materializes it.
--   2. agent_audit              — one row per agent tool call (actor, tool,
--      payload), clinic-scoped, append-only.
--   3. confirm_note_recall()    — SECURITY DEFINER helper that inserts a recall
--      scoped to the caller's clinic on Confirm (recalls has no client insert
--      policy; historically written via the 002 log_visit definer fn).
--
-- ADDITIVE + IDEMPOTENT. Requires 001 (recalls, recall_type, patients),
-- 023 (clinic_notes), and the existing current_clinic_id() helper.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Staged extraction on the note
-- ------------------------------------------------------------
alter table clinic_notes
  add column if not exists extraction jsonb;

-- ------------------------------------------------------------
-- 2. agent_audit (clinic-scoped, append-only)
-- ------------------------------------------------------------
create table if not exists agent_audit (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null default current_clinic_id()
               references clinics (id) on delete cascade,
  note_id    uuid references clinic_notes (id) on delete cascade,
  actor      uuid default auth.uid() references auth.users (id) on delete set null,
  tool       text not null,
  payload    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agent_audit_clinic  on agent_audit (clinic_id, created_at desc);
create index if not exists idx_agent_audit_note     on agent_audit (note_id);

alter table agent_audit enable row level security;
alter table agent_audit force row level security;
-- Read own clinic's trail; insert only rows for own clinic. No update/delete
-- (append-only audit).
drop policy if exists agent_audit_select on agent_audit;
create policy agent_audit_select on agent_audit for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists agent_audit_insert on agent_audit;
create policy agent_audit_insert on agent_audit for insert to authenticated
  with check (clinic_id = current_clinic_id());

-- ------------------------------------------------------------
-- 3. confirm_note_recall — materialize a proposed recall on Confirm
-- ------------------------------------------------------------
-- SECURITY DEFINER so it can insert into recalls (which has no client insert
-- policy), but it derives the clinic from the session and refuses a patient
-- outside the caller's clinic — so it can never cross the tenant boundary.
create or replace function confirm_note_recall(
  p_patient uuid,
  p_type    recall_type,
  p_due     date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := current_clinic_id();
  v_id     uuid;
begin
  if v_clinic is null then
    raise exception 'no clinic for caller';
  end if;
  if not exists (
    select 1 from patients where id = p_patient and clinic_id = v_clinic
  ) then
    raise exception 'patient not in caller clinic';
  end if;

  insert into recalls (clinic_id, patient_id, recall_type, due_date, status)
  values (v_clinic, p_patient, p_type, p_due, 'pending')
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function confirm_note_recall(uuid, recall_type, date) from public, anon;
grant  execute on function confirm_note_recall(uuid, recall_type, date) to authenticated;
