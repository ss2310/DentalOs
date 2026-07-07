-- ============================================================
-- GrowthOS — migration 046: premium AI visuals (Social Content Engine)
--
-- Optional AI-generated photo BACKDROP behind the branded overlay (hybrid,
-- never a raw AI image). Two tiers, priced in lib/visuals/tiers.ts, BOTH
-- generated via the single OpenRouter account:
--   photo  (Gemini flash image)  +1 credit single / +3 carousel
--   studio (Gemini 3 Pro image)  +2 single / +5 carousel
-- Branded template renders stay ZERO credits. These columns record which
-- posts used a premium backdrop — the month-1 usage counter the pricing
-- decision needs (count where premium_visual).
--
-- Additive + idempotent. Requires 042 (social_posts).
-- Run in the Supabase SQL editor, then: notify pgrst, 'reload schema';
-- ============================================================

alter table social_posts add column if not exists premium_visual boolean not null default false;
-- 'photo' | 'studio'; null = free branded render (or pre-046 row).
alter table social_posts add column if not exists premium_tier text;

insert into applied_migrations (version, name) values
  ('046','premium_visuals')
on conflict (version) do nothing;
