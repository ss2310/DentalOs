-- 019_subscriptions_credits.sql
-- Subscriptions, plans, credit packs, a per-balance credit ledger, billing
-- audit, and the super-admin flag. New file; existing migrations untouched.
--
-- ⚠️ TABLE-NAME NOTE — the spec called the ledger `credit_transactions`, but
-- migration 015 ALREADY owns that name with an INCOMPATIBLE shape
-- (amount / kind in ('reserve','refund') / reference_id NOT NULL, driving the
-- live reserve_credits + refund_credits system). A `create table if not exists
-- credit_transactions` here would SILENTLY no-op and 015's CHECK would reject
-- 'content'/'map' rows. So the new balance-change ledger is named
-- **credit_ledger**. 015's credit_transactions is left exactly as-is.
--
-- ⚠️ MODEL NOTE — content_credits_balance/map_credits_balance supersede the old
-- monthly_credits/credits_used counter model (015). App paid-paths still use the
-- old model until they are re-wired onto credit_ledger; both can coexist for now.
--
-- Idempotent: create-if-not-exists, add-column-if-not-exists, on-conflict seeds,
-- guarded data backfill. Requires 001 (clinics, profiles, current_clinic_id).

-- ---------------------------------------------------------------------------
-- 1. GLOBAL CATALOGS — plans + credit_packs
--    Readable by every authenticated user; writable only by a super admin.
--    No clinic_id: these are platform-wide, not tenant data.
-- ---------------------------------------------------------------------------
create table if not exists plans (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  name            text not null unique,
  price_inr       numeric(10,2) not null default 0,
  content_credits integer not null default 0,
  map_credits     integer not null default 0,
  billing_period  text not null default 'monthly'
    check (billing_period in ('trial','monthly','annual')),
  is_active       boolean not null default true,
  sort_order      integer not null default 0
);

create table if not exists credit_packs (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  name            text not null unique,
  price_inr       numeric(10,2) not null default 0,
  content_credits integer not null default 0,
  map_credits     integer not null default 0,
  is_active       boolean not null default true,
  sort_order      integer not null default 0
);

-- ---------------------------------------------------------------------------
-- 2. SUPER-ADMIN flag + helper (mirrors is_agency() from 007)
-- ---------------------------------------------------------------------------
alter table profiles
  add column if not exists is_super_admin boolean not null default false;

create or replace function is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_super_admin from profiles where id = auth.uid()), false);
$$;

revoke execute on function is_super_admin() from public;
grant execute on function is_super_admin() to anon, authenticated;

-- RLS for the catalogs: read = any authenticated; write = super admin only.
alter table plans enable row level security;
alter table plans force row level security;
drop policy if exists plans_select on plans;
create policy plans_select on plans for select to authenticated using (true);
drop policy if exists plans_insert on plans;
create policy plans_insert on plans for insert to authenticated with check (is_super_admin());
drop policy if exists plans_update on plans;
create policy plans_update on plans for update to authenticated
  using (is_super_admin()) with check (is_super_admin());
drop policy if exists plans_delete on plans;
create policy plans_delete on plans for delete to authenticated using (is_super_admin());

alter table credit_packs enable row level security;
alter table credit_packs force row level security;
drop policy if exists credit_packs_select on credit_packs;
create policy credit_packs_select on credit_packs for select to authenticated using (true);
drop policy if exists credit_packs_insert on credit_packs;
create policy credit_packs_insert on credit_packs for insert to authenticated with check (is_super_admin());
drop policy if exists credit_packs_update on credit_packs;
create policy credit_packs_update on credit_packs for update to authenticated
  using (is_super_admin()) with check (is_super_admin());
drop policy if exists credit_packs_delete on credit_packs;
create policy credit_packs_delete on credit_packs for delete to authenticated using (is_super_admin());

-- ---------------------------------------------------------------------------
-- 3. SUBSCRIPTION STATE on clinics
-- ---------------------------------------------------------------------------
alter table clinics add column if not exists subscription_status text not null default 'trial'
  check (subscription_status in ('trial','active','past_due','deactivated','cancelled'));
alter table clinics add column if not exists plan_id uuid references plans (id);
alter table clinics add column if not exists trial_started_at timestamptz;
alter table clinics add column if not exists trial_ends_at timestamptz;
alter table clinics add column if not exists current_period_end timestamptz;
alter table clinics add column if not exists content_credits_balance integer not null default 50;
alter table clinics add column if not exists map_credits_balance integer not null default 4;
alter table clinics add column if not exists billing_provider text not null default 'manual'
  check (billing_provider in ('manual','razorpay','cashfree','paypal'));
alter table clinics add column if not exists provider_customer_id text;
alter table clinics add column if not exists provider_subscription_id text;
alter table clinics add column if not exists last_payment_at timestamptz;
alter table clinics add column if not exists deactivated_at timestamptz;

-- Grandfather EXISTING clinics: carry over their remaining counter-model credits,
-- give the starting map allowance, and mark them 'active' (NOT on trial). Guarded
-- to rows still at the just-applied 'trial' default so a re-run can't clobber a
-- clinic that has since moved to a real subscription state.
update clinics set
  content_credits_balance = greatest(coalesce(monthly_credits, 0) - coalesce(credits_used, 0), 0),
  map_credits_balance     = 4,
  subscription_status     = 'active'
where subscription_status = 'trial';

-- ---------------------------------------------------------------------------
-- 4. CREDIT LEDGER (clinic-scoped, read-only to the clinic)
--    One row per balance change. Writes go through SECURITY DEFINER functions /
--    the service role (app wiring) — never directly from a client.
-- ---------------------------------------------------------------------------
create table if not exists credit_ledger (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references clinics (id) on delete cascade,
  created_at    timestamptz not null default now(),
  kind          text not null check (kind in ('content','map')),
  delta         integer not null,               -- + grant/topup, - usage
  reason        text not null check (reason in
                  ('trial_grant','topup','generation','map_scan','admin_adjust','monthly_reset')),
  balance_after integer not null,
  related_id    uuid,                            -- e.g. generated_content / rank_scan id
  created_by    uuid references auth.users (id) on delete set null
);

create index if not exists idx_credit_ledger_clinic on credit_ledger (clinic_id, created_at desc);

alter table credit_ledger enable row level security;
alter table credit_ledger force row level security;
drop policy if exists credit_ledger_select on credit_ledger;
create policy credit_ledger_select on credit_ledger for select to authenticated
  using (clinic_id = current_clinic_id());
-- No insert/update/delete policies → clients can read their clinic's ledger but
-- never write it.

-- ---------------------------------------------------------------------------
-- 5. BILLING EVENTS (audit) — super-admin readable only
-- ---------------------------------------------------------------------------
create table if not exists billing_events (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references clinics (id) on delete cascade,
  created_at timestamptz not null default now(),
  event_type text not null check (event_type in
               ('trial_started','payment_received','plan_changed','past_due',
                'deactivated','reactivated','topup')),
  amount_inr numeric(10,2),
  provider   text,
  note       text,
  actor      uuid references auth.users (id) on delete set null
);

create index if not exists idx_billing_events_clinic on billing_events (clinic_id, created_at desc);

alter table billing_events enable row level security;
alter table billing_events force row level security;
drop policy if exists billing_events_select on billing_events;
create policy billing_events_select on billing_events for select to authenticated
  using (is_super_admin());
-- No write policies → written by the service role / definer functions only.

-- ---------------------------------------------------------------------------
-- 6. HARDEN clinics UPDATE (⚠️ closes a real hole)
--    The clinics_update RLS policy lets a clinic user update ANY column on their
--    own row, and 014 only column-locked profiles — so today a clinic could set
--    content_credits_balance / subscription_status / monthly_credits itself and
--    mint free credits. Mirror 014: revoke blanket UPDATE and re-grant ONLY the
--    columns the app edits under a USER session. Everything else (balances,
--    subscription, provider ids, is_active, monthly_credits/credits_used) becomes
--    writable only by SECURITY DEFINER functions + the service role.
--
--    Allow-list = every column updated under a user session today:
--      • settings/actions.ts updateClinic  → the 12 profile/location fields
--      • generate/landing-actions.ts       → booking_slug
--    If a new user-editable clinic column is added later, ADD IT HERE too.
revoke update on clinics from authenticated;
grant update (
  business_name, doctor_name, phone, address, city, area,
  google_review_url, instagram_handle, website_url, upi_id,
  default_lat, default_lng, booking_slug
) on clinics to authenticated;

-- ---------------------------------------------------------------------------
-- 7. SEED plans + credit_packs (prices left at 0 — set them in the admin panel).
--    on-conflict-do-nothing so re-runs never overwrite prices you've since set.
-- ---------------------------------------------------------------------------
insert into plans (name, price_inr, content_credits, map_credits, billing_period, is_active, sort_order)
values
  ('Free Trial',     0, 50,  4, 'trial',   true, 0),
  ('Growth Monthly', 0, 100, 20, 'monthly', true, 1)
on conflict (name) do nothing;

insert into credit_packs (name, price_inr, content_credits, map_credits, is_active, sort_order)
values
  ('Content Top-up 50',  0, 50,  0, true, 0),
  ('Content Top-up 200', 0, 200, 0, true, 1),
  ('Map Top-up 10',      0, 0,  10, true, 2),
  ('Map Top-up 50',      0, 0,  50, true, 3)
on conflict (name) do nothing;
