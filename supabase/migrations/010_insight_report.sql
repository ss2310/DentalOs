-- ============================================================
-- GrowthOS — migration 010: Monthly Insight Report post type
--
-- Seeds ONE internal post type used by the /reviews → Insights tab. Unlike the
-- Content Studio types (005/009), this one is NOT filled from a prompt_template
-- and NOT shown in /generate: the /reviews server action gathers the clinic's
-- last-90-days data itself, builds the prompt in code, calls Claude, then saves
-- the result as a generated_content row against this type so it appears in
-- /history like any other piece.
--
-- platform 'Internal' keeps it out of the Content Studio grid (the /generate
-- loader excludes Internal) while still giving /history a name + credit cost.
-- prompt_template is NOT NULL in post_types, so we store a short doc string
-- rather than a real template.
--
-- Idempotent: reuses the post_types_name_key unique index from 005 and upserts
-- by name, same pattern as 009. Run in the Supabase SQL Editor (postgres role
-- bypasses RLS on the global post_types catalog).
-- ============================================================

insert into post_types (name, platform, credits_cost, prompt_template, schema_template, extra_fields) values
(
  'Insight Report', 'Internal', 2,
  $tpl$Data-driven report — not generated from this template. The /reviews Insights
tab gathers the clinic's last 90 days of survey responses, patient interactions,
no-show rate and revenue-recovery outcomes, builds the prompt in code, and calls
Claude (claude-sonnet-4-6). The result is saved as a generated_content row against
this post type so it shows in /history.$tpl$,
  null,
  '{"topic":{"show":false}}'::jsonb
)
on conflict (name) do update set
  platform        = excluded.platform,
  credits_cost    = excluded.credits_cost,
  prompt_template = excluded.prompt_template,
  schema_template = excluded.schema_template,
  extra_fields    = excluded.extra_fields;
