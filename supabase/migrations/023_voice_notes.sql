-- ============================================================
-- GrowthOS — migration 023: in-app voice notes
--
-- Adds the clinic_notes + followup_tasks tables plus a PRIVATE Supabase
-- Storage bucket ('voice-notes') for the transient audio. The TRANSCRIPT is
-- the record; audio is purged once a note is confirmed and hard-capped at
-- 7 days (see app/api/cron/purge-voice-audio + the confirm action).
--
-- Gated in the app behind the per-clinic feature flag `voice_notes`
-- (clinics.feature_flags, migration 018) — this migration only creates the
-- storage; the flag is enforced in the UI + API.
--
-- ADDITIVE and IDEMPOTENT: create-if-not-exists tables, drop-policy-if-exists
-- before create, on-conflict-do-nothing for the bucket. Reuses the existing
-- clinic-scoping helper current_clinic_id() (001). Requires 001 + 018.
--
-- Tenancy: both tables are CLINIC-scoped exactly like every other tenant table.
-- patient_id is NULLABLE — a null patient_id is a general clinic note (e.g. the
-- global header recorder), still isolated by clinic_id. Storage objects live
-- under a `<clinic_id>/…` prefix and are RLS-scoped the same way.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLES
-- ------------------------------------------------------------

-- ---- clinic_notes (clinic-scoped) ----
-- status lifecycle: processing → pending_review → confirmed, or → failed.
--   processing      : audio uploaded, transcription not done yet
--   pending_review  : transcript ready, staff can edit before saving
--   confirmed       : saved as the record; audio purged
--   failed          : transcription errored; staff can retry
create table if not exists clinic_notes (
  id             uuid primary key default gen_random_uuid(),
  -- Derived from the session, NEVER a client-supplied id (see current_clinic_id).
  clinic_id      uuid not null default current_clinic_id()
                   references clinics (id) on delete cascade,
  -- Null = a general clinic note not tied to any patient.
  patient_id     uuid references patients (id) on delete cascade,
  raw_transcript text,
  note_text      text,
  tags           jsonb not null default '[]'::jsonb,
  status         text  not null default 'processing'
                   check (status in ('processing','pending_review','confirmed','failed')),
  -- Storage object path within the 'voice-notes' bucket: '<clinic_id>/<id>.<ext>'.
  -- Nulled out once the audio is purged (the transcript remains the record).
  audio_path     text,
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz
);

-- ---- followup_tasks (clinic-scoped) ----
-- Lightweight to-dos raised off a note (e.g. "call patient about X").
create table if not exists followup_tasks (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null default current_clinic_id()
                references clinics (id) on delete cascade,
  note_id     uuid references clinic_notes (id) on delete cascade,
  patient_id  uuid references patients (id) on delete set null,
  description text not null,
  due_date    date,
  status      text not null default 'open' check (status in ('open','done')),
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. INDEXES
-- ------------------------------------------------------------

create index if not exists idx_clinic_notes_clinic_patient
  on clinic_notes (clinic_id, patient_id);
create index if not exists idx_clinic_notes_clinic_status
  on clinic_notes (clinic_id, status);
-- Purge scan: only rows that still hold audio matter.
create index if not exists idx_clinic_notes_audio_created
  on clinic_notes (created_at) where audio_path is not null;
create index if not exists idx_followup_tasks_clinic
  on followup_tasks (clinic_id);
create index if not exists idx_followup_tasks_note
  on followup_tasks (note_id);

-- ------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (clinic-scoped — mirrors 007)
-- ------------------------------------------------------------

-- ---- clinic_notes ----
alter table clinic_notes enable row level security;
alter table clinic_notes force row level security;
drop policy if exists clinic_notes_select on clinic_notes;
create policy clinic_notes_select on clinic_notes for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists clinic_notes_insert on clinic_notes;
create policy clinic_notes_insert on clinic_notes for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists clinic_notes_update on clinic_notes;
create policy clinic_notes_update on clinic_notes for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists clinic_notes_delete on clinic_notes;
create policy clinic_notes_delete on clinic_notes for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---- followup_tasks ----
alter table followup_tasks enable row level security;
alter table followup_tasks force row level security;
drop policy if exists followup_tasks_select on followup_tasks;
create policy followup_tasks_select on followup_tasks for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists followup_tasks_insert on followup_tasks;
create policy followup_tasks_insert on followup_tasks for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists followup_tasks_update on followup_tasks;
create policy followup_tasks_update on followup_tasks for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
drop policy if exists followup_tasks_delete on followup_tasks;
create policy followup_tasks_delete on followup_tasks for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ------------------------------------------------------------
-- 4. PRIVATE STORAGE BUCKET + OBJECT-LEVEL RLS
-- ------------------------------------------------------------
-- Private bucket (public = false): objects are only reachable via an
-- authenticated client under RLS, or a signed URL / service role. 10 MB cap
-- comfortably covers a 3-minute opus/mp4 clip.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voice-notes', 'voice-notes', false, 10485760,
  array['audio/webm','audio/mp4','audio/ogg','audio/mpeg','audio/wav','audio/x-m4a']
)
on conflict (id) do nothing;

-- Object RLS: a clinic user may only touch objects whose FIRST path segment is
-- their own clinic_id. Path convention enforced by the upload route:
-- '<clinic_id>/<note_id>.<ext>'. storage.foldername(name)[1] is that segment.
drop policy if exists voice_notes_objects_select on storage.objects;
create policy voice_notes_objects_select on storage.objects for select to authenticated
  using (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = current_clinic_id()::text
  );
drop policy if exists voice_notes_objects_insert on storage.objects;
create policy voice_notes_objects_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = current_clinic_id()::text
  );
drop policy if exists voice_notes_objects_delete on storage.objects;
create policy voice_notes_objects_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = current_clinic_id()::text
  );
