-- ============================================================
-- GrowthOS — migration 051: social-renders bucket fit for raw AI images
--
-- Social images v2 stores RAW AI provider output in social-renders (clean
-- single images + Content Studio article images). Two mismatches with the 042
-- bucket config:
--   * allowed_mime_types was ['image/png'] only — image models return png OR
--     jpeg regardless of what we ask (the code sniffs magic bytes and uploads
--     the honest type, with a declare-as-png fallback until this runs).
--   * file_size_limit was 5 MB — a photographic 1080x1080 PNG (esp. GPT-Image)
--     can brush past that, which would fail the upload AFTER the credit spend
--     (refunded, but the paid feature looks broken). 10 MB gives headroom.
--
-- Data-only update (storage.buckets row), idempotent. Requires 042.
-- Run in the Supabase SQL editor, then: notify pgrst, 'reload schema';
-- ============================================================

update storage.buckets
   set file_size_limit    = 10485760,             -- 10 MB
       allowed_mime_types = array['image/png','image/jpeg']
 where id = 'social-renders';

insert into applied_migrations (version, name) values
  ('051','render_bucket_ai_images')
on conflict (version) do nothing;

notify pgrst, 'reload schema';
