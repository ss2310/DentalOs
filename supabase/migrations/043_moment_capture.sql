-- ============================================================
-- GrowthOS — migration 043: Moment Capture (S1 capture + consent, S2 composer)
--
-- The chairside moment: staff snap a result photo, record the patient's
-- EXPLICIT consent via two separate toggles, and (with consent) fire a one-tap
-- WhatsApp review request. Photos are sensitive personal data (DPDP Act):
--   * nothing stores without a consent record (CHECK below — at least one
--     consent + who recorded it + when),
--   * photos live in a PRIVATE clinic-scoped bucket, reachable via signed
--     URLs only,
--   * the review message NEVER carries the photo (wa.me is text-only; the
--     message builders take no photo input — invariant by construction).
--
-- Consent model (approved): two toggles — A: review request, B: social
-- posting. consent_type classifies what the PHOTO may be used for:
--   B on           → 'review_and_social'  (photo may be composed for social)
--   A only         → 'review_only'        (photo stays in the private gallery)
-- consent_review (A) separately gates whether the review ask may be sent.
-- The S2 composer and the social picker admit ONLY 'review_and_social' —
-- enforced in queries, never just the UI.
--
-- Additive + idempotent. Requires 001 (clinics, patients, profiles),
-- 042 (social_posts). Run in the Supabase SQL editor, then:
-- notify pgrst, 'reload schema';
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. capture_moments
-- ---------------------------------------------------------------------------
create table if not exists capture_moments (
  id                      uuid primary key default gen_random_uuid(),
  clinic_id               uuid not null references clinics (id) on delete cascade,
  patient_id              uuid not null references patients (id) on delete restrict,
  treatment               text,
  -- Storage paths in the private 'capture-photos' bucket:
  -- '<clinic_id>/<moment_id>/after.<ext>' (+ optional before).
  after_photo_path        text not null,
  before_photo_path       text,
  -- Consent record (DPDP): the two explicit toggles + who recorded them, when.
  consent_review          boolean not null default false,
  consent_social          boolean not null default false,
  consent_type            text not null
                            check (consent_type in ('review_only','review_and_social')),
  consent_recorded_by     uuid not null references profiles (id),
  consent_recorded_at     timestamptz not null default now(),
  -- Review ask (only when consent_review; single-fire ✓ Sent pattern).
  review_request_sent_at  timestamptz,
  created_at              timestamptz not null default now(),

  -- Nothing stores without consent, and the type must match the toggles:
  -- social consent → review_and_social; review-only consent → review_only.
  constraint capture_consent_present check (consent_review or consent_social),
  constraint capture_consent_type_matches check (
    (consent_social and consent_type = 'review_and_social')
    or (not consent_social and consent_type = 'review_only')
  )
);

create index if not exists idx_capture_moments_clinic
  on capture_moments (clinic_id, created_at desc);
create index if not exists idx_capture_moments_patient
  on capture_moments (patient_id);
-- The 30-day anti-abuse lookup: last review ask per patient across captures.
create index if not exists idx_capture_moments_review_ask
  on capture_moments (patient_id, review_request_sent_at)
  where review_request_sent_at is not null;

alter table capture_moments enable row level security;
alter table capture_moments force row level security;
drop policy if exists capture_moments_select on capture_moments;
create policy capture_moments_select on capture_moments for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists capture_moments_insert on capture_moments;
create policy capture_moments_insert on capture_moments for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists capture_moments_update on capture_moments;
create policy capture_moments_update on capture_moments for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
-- Delete = consent revocation (the app also removes the storage objects).
drop policy if exists capture_moments_delete on capture_moments;
create policy capture_moments_delete on capture_moments for delete to authenticated
  using (clinic_id = current_clinic_id());

-- ---------------------------------------------------------------------------
-- 2. Link composed social posts back to their source moment (gallery shows
--    post status), and allow the composer's image source.
-- ---------------------------------------------------------------------------
alter table social_posts
  add column if not exists source_moment_id uuid references capture_moments (id) on delete set null;
create index if not exists idx_social_posts_moment
  on social_posts (source_moment_id) where source_moment_id is not null;

alter table social_posts drop constraint if exists social_posts_image_source_check;
alter table social_posts add constraint social_posts_image_source_check
  check (image_source in ('template','moment_capture'));

-- ---------------------------------------------------------------------------
-- 3. Private capture-photos bucket. 8 MB cap (phone camera JPEGs). Clinic
--    users read/write ONLY under their own clinic's folder; every display
--    goes through signed URLs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capture-photos', 'capture-photos', false, 8388608,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists capture_photos_select on storage.objects;
create policy capture_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'capture-photos'
         and (storage.foldername(name))[1] = current_clinic_id()::text);
drop policy if exists capture_photos_insert on storage.objects;
create policy capture_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'capture-photos'
              and (storage.foldername(name))[1] = current_clinic_id()::text);
drop policy if exists capture_photos_delete on storage.objects;
create policy capture_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'capture-photos'
         and (storage.foldername(name))[1] = current_clinic_id()::text);

-- ---------------------------------------------------------------------------
-- 4. Register this migration.
-- ---------------------------------------------------------------------------
insert into applied_migrations (version, name) values
  ('043','moment_capture')
on conflict (version) do nothing;
