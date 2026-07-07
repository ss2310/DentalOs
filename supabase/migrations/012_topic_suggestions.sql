-- ============================================================
-- GrowthOS — migration 012: topic-suggestion banks for Content Studio
--
-- Adds a curated bank of ready-made topics that /generate can offer as a
-- dropdown per post type, so receptionists don't stare at a blank "Topic" box.
--
--   * topic_suggestions — one row per suggested topic, grouped by `bank`.
--     clinic_id IS NULL  → global curated (seeded here, service-role only).
--     clinic_id = clinic → reserved for future clinic-specific topics
--                          (e.g. source 'clinic_question'); no write path yet.
--   * post_types.topic_bank — which bank a type draws its dropdown from
--     (NULL = no topic dropdown, e.g. data-entry / response types).
--
-- RLS: any authenticated user may READ curated rows (clinic_id IS NULL) plus
-- their own clinic's rows (clinic_id = current_clinic_id()). There are NO write
-- policies, so only the service role (which bypasses RLS) can seed/curate — the
-- same posture as the global post_types catalog.
--
-- Additive + idempotent (create-if-not-exists, add-column-if-not-exists,
-- drop-policy-before-create, upsert seed). Run in the Supabase SQL Editor; the
-- postgres role bypasses RLS so the curated seed + post_types mapping apply.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLE
-- ------------------------------------------------------------
create table if not exists topic_suggestions (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bank       text not null,
  niche      text not null default 'dental',
  label      text not null,
  sort_order integer not null default 0,
  is_active  boolean not null default true,
  -- NULL = global curated; non-null = clinic-specific (future).
  clinic_id  uuid references clinics (id) on delete cascade,
  source     text not null default 'curated'
    check (source in ('curated', 'clinic_question'))
);

create index if not exists idx_topic_suggestions_bank
  on topic_suggestions (bank, sort_order);
create index if not exists idx_topic_suggestions_clinic
  on topic_suggestions (clinic_id);

-- Lets the curated seed below be re-run as an upsert (refreshes order/active)
-- without creating duplicate rows. Partial: applies to global curated rows.
create unique index if not exists uq_topic_suggestions_curated
  on topic_suggestions (bank, label)
  where clinic_id is null;

-- ------------------------------------------------------------
-- 2. ROW LEVEL SECURITY  (read curated + own clinic; no writes for users)
-- ------------------------------------------------------------
alter table topic_suggestions enable row level security;
alter table topic_suggestions force row level security;

drop policy if exists topic_suggestions_select on topic_suggestions;
create policy topic_suggestions_select on topic_suggestions for select to authenticated
  using (clinic_id is null or clinic_id = current_clinic_id());

-- ------------------------------------------------------------
-- 3. post_types.topic_bank  (which bank each type's dropdown draws from)
-- ------------------------------------------------------------
alter table post_types add column if not exists topic_bank text;

update post_types set topic_bank = 'social'
  where name in ('GBP Post', 'Instagram Caption', 'Instagram Reel Script');
update post_types set topic_bank = 'article'
  where name in ('Blog Article', 'Blog Article with FAQ');
update post_types set topic_bank = 'service'
  where name in ('Service Page', 'Geo Landing Page');
update post_types set topic_bank = 'guide'
  where name = 'Clinician Guide (YMYL)';
update post_types set topic_bank = 'comparison'
  where name = 'Treatment Comparison';
update post_types set topic_bank = 'question'
  where name = 'Question Answer Page';
update post_types set topic_bank = 'occasion'
  where name = 'WhatsApp Broadcast';
update post_types set topic_bank = 'update'
  where name = 'Dental Update / What''s New';
-- Data-entry / response types have no topic dropdown.
update post_types set topic_bank = null
  where name in ('City Dental Stats', 'Review Response', 'GBP Q&A Response');

-- ------------------------------------------------------------
-- 4. SEED curated topics (niche 'dental', source 'curated', clinic_id NULL)
--    sort_order increments within each bank. Upsert on (bank, label).
-- ------------------------------------------------------------
insert into topic_suggestions (bank, label, sort_order) values
-- BANK 'social'
('social', 'Painless root canal myths busted', 1),
('social', 'Why bleeding gums are an early warning', 2),
('social', 'Teeth whitening: safe vs enamel-damaging', 3),
('social', 'Kids'' first dental visit — when and why', 4),
('social', 'Dental emergency: broken or knocked-out tooth', 5),
('social', 'Bad breath: real causes and fixes', 6),
('social', 'Why scaling does NOT weaken teeth', 7),
('social', 'Signs you need a dental checkup', 8),
('social', 'Diabetes and your dental health', 9),
('social', 'Wisdom tooth pain — when it must go', 10),
('social', 'Braces vs aligners — which suits you', 11),
('social', 'Caring for teeth after an extraction', 12),
('social', 'Hot/cold sensitivity — what it means', 13),
('social', 'Why a crown after RCT isn''t optional', 14),
('social', 'Festival/wedding season smile-ready tips', 15),
-- BANK 'article'
('article', 'How many visits does a root canal take?', 1),
('article', 'Complete guide to dental implants', 2),
('article', 'Braces vs clear aligners: full comparison', 3),
('article', 'Is teeth whitening safe?', 4),
('article', 'Wisdom tooth removal: what to expect', 5),
('article', 'Gum disease: warning signs and treatment', 6),
('article', 'What affects the cost of dental treatment', 7),
('article', 'Dental care during pregnancy', 8),
('article', 'Caring for children''s teeth by age', 9),
('article', 'Root canal vs extraction: which is better', 10),
('article', 'How long do dental crowns last?', 11),
('article', 'Managing dental anxiety', 12),
('article', 'Diabetes and dental treatment', 13),
('article', 'Post-treatment care guide', 14),
('article', 'Preventive dentistry: how often to visit', 15),
-- BANK 'service'
('service', 'Root Canal Treatment (RCT)', 1),
('service', 'Dental Implants', 2),
('service', 'Teeth Whitening', 3),
('service', 'Braces / Orthodontics', 4),
('service', 'Clear Aligners', 5),
('service', 'Dental Crowns', 6),
('service', 'Scaling & Polishing', 7),
('service', 'Tooth Extraction', 8),
('service', 'Composite Fillings', 9),
('service', 'Full Mouth Rehabilitation', 10),
('service', 'Dentures', 11),
('service', 'Pediatric Dentistry', 12),
('service', 'Gum Treatment (Periodontics)', 13),
('service', 'Smile Makeover / Veneers', 14),
('service', 'Wisdom Tooth Surgery', 15),
-- BANK 'guide'
('guide', 'Diabetes and dental implants: risks and considerations', 1),
('guide', 'Dental treatment during pregnancy', 2),
('guide', 'Heart conditions and dental procedures', 3),
('guide', 'Blood thinners and tooth extraction', 4),
('guide', 'Osteoporosis medication and implants', 5),
('guide', 'Root canal vs extraction: evidence-based', 6),
('guide', 'Oral cancer: warning signs and screening', 7),
('guide', 'Dental care for elderly patients', 8),
('guide', 'Antibiotics in dentistry: when needed', 9),
('guide', 'Dental anxiety and sedation options', 10),
('guide', 'Gum disease and overall health', 11),
('guide', 'Fluoride: benefits and safety', 12),
('guide', 'Dental implant success factors', 13),
('guide', 'Post-surgical care after oral surgery', 14),
('guide', 'Managing dental care for special-needs children', 15),
-- BANK 'comparison'
('comparison', 'Braces vs Aligners vs Veneers', 1),
('comparison', 'Root Canal vs Extraction', 2),
('comparison', 'Implant vs Bridge vs Denture', 3),
('comparison', 'Metal-Ceramic Crown vs Zirconia Crown', 4),
('comparison', 'Composite vs Amalgam Filling', 5),
('comparison', 'Professional vs At-Home Whitening', 6),
('comparison', 'Fixed Braces vs Clear Aligners', 7),
('comparison', 'Single-Sitting vs Multi-Sitting RCT', 8),
('comparison', 'Removable Denture vs Fixed Implant Denture', 9),
('comparison', 'Veneers vs Bonding', 10),
('comparison', 'Manual vs Electric Toothbrush', 11),
('comparison', 'Deep Cleaning vs Regular Cleaning', 12),
('comparison', 'Ceramic vs Metal Braces', 13),
('comparison', 'Local Anaesthesia vs Sedation Dentistry', 14),
('comparison', 'Immediate vs Delayed Implant Placement', 15),
-- BANK 'question'
('question', 'How many visits does a root canal take?', 1),
('question', 'Is a root canal painful?', 2),
('question', 'Can diabetics get dental implants?', 3),
('question', 'How long do dental implants last?', 4),
('question', 'Are clear aligners better than braces?', 5),
('question', 'Is teeth whitening safe for enamel?', 6),
('question', 'Why do I need a crown after a root canal?', 7),
('question', 'Is dental treatment safe during pregnancy?', 8),
('question', 'How often should I visit the dentist?', 9),
('question', 'What should I do if a tooth is knocked out?', 10),
('question', 'Why are my gums bleeding when I brush?', 11),
('question', 'Does scaling weaken teeth?', 12),
('question', 'At what age should braces start?', 13),
('question', 'How do I care for my teeth after an extraction?', 14),
('question', 'What causes tooth sensitivity?', 15),
-- BANK 'occasion'
('occasion', 'Diwali smile-ready offer', 1),
('occasion', 'New Year dental checkup reminder', 2),
('occasion', 'Wedding season smile makeover', 3),
('occasion', 'World Oral Health Day (Mar 20)', 4),
('occasion', 'Children''s Day dental camp', 5),
('occasion', 'Summer break kids'' checkup', 6),
('occasion', 'Independence/Republic Day greeting', 7),
('occasion', 'Monsoon dental care tips', 8),
('occasion', 'Free consultation week', 9),
('occasion', 'Seasonal scaling & polishing offer', 10),
('occasion', 'Senior citizens'' dental care day', 11),
('occasion', 'Back-to-school checkup', 12),
('occasion', 'Holi — protect your smile', 13),
('occasion', 'Clinic anniversary offer', 14),
('occasion', '6-month recall reminder', 15),
-- BANK 'update'
('update', 'New painless RCT technology', 1),
('update', 'Latest clear aligner technology', 2),
('update', 'Digital smile design now available', 3),
('update', 'Upgraded sterilization protocols', 4),
('update', 'New specialist/service introduced', 5),
('update', 'Advances in implant materials', 6),
('update', 'Laser dentistry now offered', 7),
('update', '3D scanning / digital impressions', 8),
('update', 'Same-day crowns (CAD/CAM)', 9),
('update', 'Updated infection-control standards', 10),
('update', 'New pediatric facilities', 11),
('update', 'Latest whitening technology', 12),
('update', 'Clinic expansion / new chair', 13),
('update', 'New flexible payment options', 14),
('update', 'Community dental camp', 15)
on conflict (bank, label) where clinic_id is null
  do update set sort_order = excluded.sort_order, is_active = true;
