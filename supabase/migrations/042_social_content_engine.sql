-- ============================================================
-- GrowthOS — migration 042: Social Content Engine (Phase 1, manual publish)
--
-- Extends the /generate Content Studio with platform-shaped social posts:
--   * clinic_voice_profiles  — "Brand Personality": versioned, one active per
--                              clinic; feeds generation as extra prompt context.
--   * compliance_rules       — vertical catalog (nullable vertical, NULL=all):
--                              banned phrases + required disclaimers. Finally
--                              gives scripts/seed-vertical.mjs its pending store.
--   * few_shot_examples      — vertical catalog of Hinglish few-shots injected
--                              into social generation prompts.
--   * clinic_brand_kits      — logo + brand colors + safe-list font for the
--                              zero-AI template image renderer.
--   * social_posts           — the queue. Status machine (enforced in ONE place,
--                              lib/social/status.mjs): draft → pending_approval
--                              → approved|rejected; approved → posted_manually.
--                              NO API-publishing states — clinics post manually.
--   * posting_activity_events— emit-only signal loop for the D-series
--                              Operational Velocity / Market Activity scoring.
--   * plans.social_posts_monthly — per-plan monthly post quota (Growth = 30).
--   * storage buckets: brand-assets (logo uploads), social-renders (PNG output).
--
-- Additive + idempotent. Requires 001 (clinics, profiles, generated_content),
-- 012 (topic_suggestions), 019 (plans), 026 (verticals). Run in the Supabase
-- SQL editor, then: notify pgrst, 'reload schema';
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. clinic_voice_profiles — Brand Personality (UI name), versioned.
--    One ACTIVE row per clinic (partial unique). Generation never runs
--    personality-less: the app builds a safe default when none exists.
--    proof_points: [{claim, source, status:'verified'|'unverified'}] — items
--    without a source are stored 'unverified' and NEVER reach generation
--    (filtered in lib/social/voice.ts, unit-tested).
-- ---------------------------------------------------------------------------
create table if not exists clinic_voice_profiles (
  id                   uuid primary key default gen_random_uuid(),
  clinic_id            uuid not null references clinics (id) on delete cascade,
  version              integer not null default 1,
  is_active            boolean not null default true,
  identity_line        text not null,
  audience             text,
  -- Tone sliders, 0–100: 0 = fully formal / clinical, 100 = fully friendly /
  -- conversational.
  tone_friendly        integer not null default 50
                         check (tone_friendly between 0 and 100),
  tone_conversational  integer not null default 50
                         check (tone_conversational between 0 and 100),
  -- Per-platform language mix, e.g. {"instagram":"hinglish","facebook":"english","gbp":"english"}
  language_mix         jsonb not null default '{"instagram":"hinglish","facebook":"english","gbp":"english"}'::jsonb,
  banned_phrases       text[] not null default '{}',
  required_disclaimers text[] not null default '{}',
  -- CTA channel. The WhatsApp number always comes from clinics.phone at
  -- generation time — never stored or free-typed here.
  cta_preference       text not null default 'whatsapp'
                         check (cta_preference in ('whatsapp','call','walkin')),
  proof_points         jsonb not null default '[]'::jsonb,
  source               text not null default 'wizard'
                         check (source in ('wizard','default')),
  created_by           uuid references profiles (id),
  created_at           timestamptz not null default now()
);

create unique index if not exists uq_voice_profile_active
  on clinic_voice_profiles (clinic_id) where is_active;
create index if not exists idx_voice_profiles_clinic
  on clinic_voice_profiles (clinic_id, version);

alter table clinic_voice_profiles enable row level security;
alter table clinic_voice_profiles force row level security;
drop policy if exists voice_profiles_select on clinic_voice_profiles;
create policy voice_profiles_select on clinic_voice_profiles for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists voice_profiles_insert on clinic_voice_profiles;
create policy voice_profiles_insert on clinic_voice_profiles for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists voice_profiles_update on clinic_voice_profiles;
create policy voice_profiles_update on clinic_voice_profiles for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());

-- ---------------------------------------------------------------------------
-- 2. compliance_rules — global/vertical catalog (like post_types). Three kinds:
--    'banned_phrase' (string-matched by the YMYL validator), 'disclaimer'
--    (must appear in output; auto-appended), 'guidance' (prose rule injected
--    into the generation prompt — the shape seeds/verticals/*.ts already carry).
--    NULL vertical = applies to all verticals; resolved via resolveForVertical.
--    Read-only to clients; service role curates (scripts/seed-vertical.mjs now
--    writes its previously-pending compliance arrays here).
-- ---------------------------------------------------------------------------
create table if not exists compliance_rules (
  id         uuid primary key default gen_random_uuid(),
  vertical   text references verticals (id),
  kind       text not null check (kind in ('banned_phrase','disclaimer','guidance')),
  rule       text not null,
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Re-runnable seeds need a stable conflict target.
create unique index if not exists uq_compliance_rules_slot
  on compliance_rules (coalesce(vertical, ''), kind, rule);
create index if not exists idx_compliance_rules_vertical
  on compliance_rules (vertical, kind);

alter table compliance_rules enable row level security;
alter table compliance_rules force row level security;
drop policy if exists compliance_rules_select on compliance_rules;
create policy compliance_rules_select on compliance_rules for select to authenticated
  using (true);

-- Shared (NULL-vertical) banned phrases — the YMYL floor for every vertical.
-- Dental content stays in the NULL pool per the vertical-expansion rules.
insert into compliance_rules (vertical, kind, rule, sort_order) values
  (null, 'banned_phrase', '100% painless',            1),
  (null, 'banned_phrase', 'completely painless',      2),
  (null, 'banned_phrase', 'guaranteed result',        3),
  (null, 'banned_phrase', 'guaranteed results',       4),
  (null, 'banned_phrase', 'guarantee',                5),
  (null, 'banned_phrase', 'best in city',             6),
  (null, 'banned_phrase', 'best in town',             7),
  (null, 'banned_phrase', 'no. 1 clinic',             8),
  (null, 'banned_phrase', 'number one clinic',        9),
  (null, 'banned_phrase', 'no side effects',          10),
  (null, 'banned_phrase', 'permanent solution',       11),
  (null, 'banned_phrase', 'miracle',                  12),
  (null, 'banned_phrase', 'instant cure',             13),
  (null, 'banned_phrase', 'lifetime warranty',        14)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. few_shot_examples — vertical catalog of style exemplars (real Hinglish),
--    injected 2–3 at a time into social generation prompts. NULL vertical =
--    shared pool (dental's exemplars live here, serving every vertical as the
--    fallback). platform matches social_posts.platform, or 'any'.
-- ---------------------------------------------------------------------------
create table if not exists few_shot_examples (
  id         uuid primary key default gen_random_uuid(),
  vertical   text references verticals (id),
  platform   text not null default 'any'
               check (platform in ('any','instagram','facebook','gbp')),
  example    text not null,
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_few_shot_slot
  on few_shot_examples (coalesce(vertical, ''), platform, sort_order);
create index if not exists idx_few_shots_vertical
  on few_shot_examples (vertical, platform);

alter table few_shot_examples enable row level security;
alter table few_shot_examples force row level security;
drop policy if exists few_shots_select on few_shot_examples;
create policy few_shots_select on few_shot_examples for select to authenticated
  using (true);

-- Shared (NULL) Hinglish exemplars — natural Indore-style Hinglish: Hindi flow,
-- English clinical/branded nouns, no forced translation of either.
insert into few_shot_examples (vertical, platform, example, sort_order) values
  (null, 'instagram',
   'Thand ka mausam aa gaya hai — aur saath mein sensitive teeth ki shikayat bhi! 🥶 Agar thanda paani lagte hi jhatka lagta hai, toh ignore mat kariye. Ye enamel wear ya cavity ka early sign ho sakta hai. Simple checkup se pata chal jaata hai. Is winter apne daanton ka khayal rakhiye 😊',
   1),
  (null, 'instagram',
   'Bacchon ki school holidays chal rahi hain? Perfect time hai unke dental checkup ke liye! 🦷 Chhoti umar mein aadat ban jaaye toh lifetime ka fayda. Appointment ke liye WhatsApp kariye — link bio mein hai 👆',
   2),
  (null, 'facebook',
   'Kya aapko khaana chabaate waqt ek hi side use karne ki aadat ho gayi hai? Aksar iska matlab hota hai ki doosri side mein koi daant pareshan kar raha hai. Ye chhota sa signal bada issue banne se pehle checkup karwa lena samajhdaari hai. Clinic timing aur appointment ki jaankari ke liye humein message kariye.',
   1)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. clinic_brand_kits — inputs for the template image renderer (composition
--    only, zero AI). One per clinic. Font restricted to the bundled safe list.
-- ---------------------------------------------------------------------------
create table if not exists clinic_brand_kits (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null unique references clinics (id) on delete cascade,
  logo_path       text,
  primary_color   text not null default '#0D9488'
                    check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#1D1D1F'
                    check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  font            text not null default 'inter'
                    check (font in ('inter','poppins','lora')),
  updated_at      timestamptz not null default now()
);

alter table clinic_brand_kits enable row level security;
alter table clinic_brand_kits force row level security;
drop policy if exists brand_kits_select on clinic_brand_kits;
create policy brand_kits_select on clinic_brand_kits for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists brand_kits_insert on clinic_brand_kits;
create policy brand_kits_insert on clinic_brand_kits for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists brand_kits_update on clinic_brand_kits;
create policy brand_kits_update on clinic_brand_kits for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());

-- ---------------------------------------------------------------------------
-- 5. social_posts — one row per platform variant. The status machine lives in
--    lib/social/status.mjs; the CHECK here only bounds the value set. Manual
--    publish only: posted_manually is terminal, stamped with posted_at.
--    image_source is the Phase-2 Moment Capture seam — widen the CHECK when the
--    gallery picker lands ('moment_capture'); Phase 1 allows only 'template'.
-- ---------------------------------------------------------------------------
create table if not exists social_posts (
  id                uuid primary key default gen_random_uuid(),
  clinic_id         uuid not null references clinics (id) on delete cascade,
  batch_id          uuid,                 -- groups a weekly-planner batch
  source_content_id uuid references generated_content (id) on delete set null,
  voice_profile_id  uuid references clinic_voice_profiles (id) on delete set null,
  topic             text,
  campaign_type     text,                 -- weekly focus / offer / event / manual
  platform          text not null check (platform in ('instagram','facebook','gbp')),
  format            text not null default 'single' check (format in ('single','carousel')),
  caption           text not null,
  hashtags          text[] not null default '{}',
  carousel_slides   jsonb,                -- 6-slide JSON for the renderer
  gbp_post_type     text check (gbp_post_type in ('update','offer','event')),
  soft_warnings     text[] not null default '{}',  -- GBP content-rule warnings
  ymyl_flags        jsonb,                -- named violations when generation surfaced flagged
  image_source      text not null default 'template' check (image_source in ('template')),
  render_paths      text[] not null default '{}',  -- storage paths in social-renders
  scheduled_date    date,
  status            text not null default 'draft'
                      check (status in ('draft','pending_approval','approved','posted_manually','rejected')),
  credits_deducted  integer not null default 0,
  approved_at       timestamptz,
  posted_at         timestamptz,
  created_by        uuid references profiles (id),
  created_at        timestamptz not null default now()
);

create index if not exists idx_social_posts_clinic_status
  on social_posts (clinic_id, status);
create index if not exists idx_social_posts_clinic_date
  on social_posts (clinic_id, scheduled_date);
create index if not exists idx_social_posts_batch
  on social_posts (batch_id);
-- Monthly quota checks count rows per clinic per created-month.
create index if not exists idx_social_posts_clinic_created
  on social_posts (clinic_id, created_at);

alter table social_posts enable row level security;
alter table social_posts force row level security;
drop policy if exists social_posts_select on social_posts;
create policy social_posts_select on social_posts for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists social_posts_insert on social_posts;
create policy social_posts_insert on social_posts for insert to authenticated
  with check (clinic_id = current_clinic_id());
drop policy if exists social_posts_update on social_posts;
create policy social_posts_update on social_posts for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());
-- No delete policy: rejected posts stay as an audit trail.

-- ---------------------------------------------------------------------------
-- 6. posting_activity_events — emit-only signal loop (D-series Operational
--    Velocity / Market Activity consumes these later; scoring wiring is out of
--    scope here). Stable shape: clinic, post, platform, campaign_type, when.
-- ---------------------------------------------------------------------------
create table if not exists posting_activity_events (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics (id) on delete cascade,
  post_id       uuid not null references social_posts (id) on delete cascade,
  event_type    text not null default 'posted_manually'
                  check (event_type in ('posted_manually')),
  platform      text not null,
  campaign_type text,
  occurred_at   timestamptz not null default now(),
  payload       jsonb
);

create index if not exists idx_posting_events_clinic
  on posting_activity_events (clinic_id, occurred_at);
-- One event per post (idempotent emit on the posted_manually transition).
create unique index if not exists uq_posting_events_post
  on posting_activity_events (post_id, event_type);

alter table posting_activity_events enable row level security;
alter table posting_activity_events force row level security;
drop policy if exists posting_events_select on posting_activity_events;
create policy posting_events_select on posting_activity_events for select to authenticated
  using (clinic_id = current_clinic_id());
drop policy if exists posting_events_insert on posting_activity_events;
create policy posting_events_insert on posting_activity_events for insert to authenticated
  with check (clinic_id = current_clinic_id());

-- ---------------------------------------------------------------------------
-- 7. Per-plan monthly social post quota. 0 = feature not included. Growth
--    plans get 30/month; the trial plan gets 5 so the feature can be tried.
-- ---------------------------------------------------------------------------
alter table plans add column if not exists social_posts_monthly integer not null default 0;

update plans set social_posts_monthly = 30 where billing_period in ('monthly','annual');
update plans set social_posts_monthly = 5  where billing_period = 'trial';

-- ---------------------------------------------------------------------------
-- 8. Storage: brand-assets (logo uploads, clinic-scoped path '<clinic_id>/…')
--    and social-renders (renderer output PNGs, written by the server, read via
--    signed URLs / clinic-scoped select).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-assets', 'brand-assets', false, 2097152,
        array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('social-renders', 'social-renders', false, 5242880, array['image/png'])
on conflict (id) do nothing;

drop policy if exists brand_assets_select on storage.objects;
create policy brand_assets_select on storage.objects for select to authenticated
  using (bucket_id = 'brand-assets'
         and (storage.foldername(name))[1] = current_clinic_id()::text);
drop policy if exists brand_assets_insert on storage.objects;
create policy brand_assets_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'brand-assets'
              and (storage.foldername(name))[1] = current_clinic_id()::text);
drop policy if exists brand_assets_update on storage.objects;
create policy brand_assets_update on storage.objects for update to authenticated
  using (bucket_id = 'brand-assets'
         and (storage.foldername(name))[1] = current_clinic_id()::text);
drop policy if exists brand_assets_delete on storage.objects;
create policy brand_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'brand-assets'
         and (storage.foldername(name))[1] = current_clinic_id()::text);

drop policy if exists social_renders_select on storage.objects;
create policy social_renders_select on storage.objects for select to authenticated
  using (bucket_id = 'social-renders'
         and (storage.foldername(name))[1] = current_clinic_id()::text);
-- Renders are written server-side only (service role bypasses RLS): no
-- insert/update/delete policies for authenticated.

-- ---------------------------------------------------------------------------
-- 9. Register this migration.
-- ---------------------------------------------------------------------------
insert into applied_migrations (version, name) values
  ('042','social_content_engine')
on conflict (version) do nothing;
