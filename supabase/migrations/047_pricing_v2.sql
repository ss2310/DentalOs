-- ============================================================
-- GrowthOS — migration 047: pricing v2 (₹2,999 base, credits = profit centre)
--
-- Economics (measured 07 Jul 2026): worst-case COGS per credit-funded action
-- ≈ ₹6 (3-credit Claude blog); premium images ₹1–4; map scan ~₹5; deep audit
-- ~₹100. Anchor: 1 credit = ₹10 retail, floor ₹8.5/credit in packs → every
-- action ≥60% margin, blended plan margin ~80%.
--
-- Changes:
--   * Growth Monthly → ₹2,999 (map credits 20 → 10; content 100, 1 deep
--     audit, 30 social posts unchanged).
--   * Growth Annual → ₹29,990 if it exists (2 months free).
--   * Credit packs get REAL prices (they were seeded at ₹0 = unsellable):
--     Content 50 → ₹549, Content 200 → ₹1,699, Map 10 → ₹449, Map 50 →
--     ₹1,799. Deep Audit Top-up stays ₹599.
--   * Free Trial plan row → 30 content / 2 map (signup constants updated in
--     app/signup/actions.ts in the same release).
--
-- Additive + idempotent (updates by unique name). Requires 019, 040, 042.
-- Run in the Supabase SQL editor, then: notify pgrst, 'reload schema';
-- ============================================================

update plans set price_inr = 2999, map_credits = 10
 where name = 'Growth Monthly';

update plans set price_inr = 29990
 where name = 'Growth Annual';

update plans set content_credits = 30, map_credits = 2
 where name = 'Free Trial';

update credit_packs set price_inr = 549  where name = 'Content Top-up 50';
update credit_packs set price_inr = 1699 where name = 'Content Top-up 200';
update credit_packs set price_inr = 449  where name = 'Map Top-up 10';
update credit_packs set price_inr = 1799 where name = 'Map Top-up 50';
update credit_packs set price_inr = 599  where name = 'Deep Audit Top-up';

-- Packs with a real price should be purchasable; the ₹0 seeds may have been
-- left inactive. Activate exactly the five packs priced above.
update credit_packs set is_active = true
 where name in ('Content Top-up 50','Content Top-up 200','Map Top-up 10',
                'Map Top-up 50','Deep Audit Top-up');

insert into applied_migrations (version, name) values
  ('047','pricing_v2')
on conflict (version) do nothing;
