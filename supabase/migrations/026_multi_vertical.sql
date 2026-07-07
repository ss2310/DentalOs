-- ============================================================
-- GrowthOS — migration 026: multi-vertical foundation (ADD-ONLY)
--
-- Groundwork for serving non-dental clinics (derma, ortho, physio, …) WITHOUT
-- changing anything for the dental clinics live today.
--
-- STRICTLY ADDITIVE. This migration only:
--   * creates one new table (verticals),
--   * adds new columns (one defaulted on clinics; nullable on the catalogs).
-- It NEVER alters/renames/drops an existing column, and it does NOT hand-backfill
-- any row. Existing clinics adopt vertical='dental' purely from the column
-- DEFAULT — that default is the only mechanism that populates the column.
--
-- Resolution rule (enforced in app code — lib/vertical): a clinic sees the rows
-- whose `vertical` matches its own, else the shared rows (vertical IS NULL),
-- never another vertical's. Today every catalog row is NULL, so every existing
-- (dental) clinic keeps seeing exactly what it sees now — byte-for-byte.
--
-- Reverse with: supabase/rollback/026_multi_vertical.down.sql (kept OUT of the
-- migrations/ folder so a migration runner never applies the rollback as a
-- forward step).
-- Additive + idempotent. Run in the Supabase SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. verticals — global reference catalog (read-only to clients)
-- ------------------------------------------------------------
create table if not exists verticals (
  id           text primary key,             -- slug, e.g. 'dental', 'derma'
  display_name text not null,
  is_active    boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Seed EXACTLY one row. Dental is the only active vertical today; no non-dental
-- rows are seeded anywhere in this migration.
insert into verticals (id, display_name, is_active)
values ('dental', 'Dental', true)
on conflict (id) do nothing;

-- RLS: any authenticated user may READ; there are NO write policies, so only the
-- service role (which bypasses RLS) can curate — the same posture as post_types.
-- verticals is a global catalog, not tenant data, so it isn't clinic-scoped.
alter table verticals enable row level security;
alter table verticals force row level security;
drop policy if exists verticals_select on verticals;
create policy verticals_select on verticals for select to authenticated
  using (true);

-- ------------------------------------------------------------
-- 2. clinics.vertical — every clinic belongs to exactly one vertical
-- ------------------------------------------------------------
-- NOT NULL DEFAULT 'dental' so existing rows adopt dental automatically via the
-- default (no manual UPDATE). FK guarantees the value is a known vertical.
alter table clinics
  add column if not exists vertical text not null default 'dental'
    references verticals (id);

-- ------------------------------------------------------------
-- 3. Catalog tables gain a NULLABLE vertical
-- ------------------------------------------------------------
-- NULL = "applies to all verticals". All existing rows stay NULL, which is what
-- keeps current behavior identical. A non-null value scopes a row to one vertical.
alter table post_types
  add column if not exists vertical text references verticals (id);

alter table topic_suggestions
  add column if not exists vertical text references verticals (id);

-- NOTE: this schema has NO `compliance_rules` table and NO dedicated few-shot
-- examples table. Compliance/brand-safety guidance lives inside the shared system
-- prompt and each post_types.prompt_template, which the resolution rule already
-- covers via post_types.vertical. If a compliance_rules or few-shot table is
-- introduced later, give it a `vertical text references verticals(id)` (nullable)
-- and route its loader through resolveForVertical(), exactly like the two above.
