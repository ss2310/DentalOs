-- 032_cashfree_checkout.sql
-- Cashfree hosted-checkout wiring (the order-creation half; the webhook lands
-- next). Adds `pending_payments` — one row per Cashfree order we start — plus a
-- clinic-scoped definer RPC that files that row with a DB-authoritative price,
-- and routes the customer-facing checkout path to Cashfree by default.
--
-- FULFILLMENT NOTE — this table only TRACKS the gateway order. Credits/activation
-- still flow through the existing engine (020): the webhook (next migration/route)
-- maps a paid pending_payments row back to confirm_billing_event(). Nothing here
-- grants credits or flips a subscription.
--
-- Idempotent: create-if-not-exists, create-or-replace fn, guarded backfill.
-- Requires 001 (clinics, current_clinic_id), 019 (plans, credit_packs,
-- billing_provider enum), 031 (applied_migrations).
-- ⚠️ DDL — run by hand in the Supabase SQL editor.

-- ===========================================================================
-- 1. PENDING PAYMENTS — one row per Cashfree order (clinic-scoped).
--    The order_id we send to Cashfree IS this row's id, so the webhook maps a
--    payment back trivially. `status` tracks the gateway lifecycle only.
-- ===========================================================================
create table if not exists pending_payments (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references clinics (id) on delete cascade,
  created_at  timestamptz not null default now(),
  item_type   text not null check (item_type in ('plan','pack')),
  item_id     uuid not null,                  -- plans.id or credit_packs.id (per item_type)
  amount_inr  numeric(10,2) not null,         -- snapshot of the DB price at order time
  cf_order_id text unique,                    -- Cashfree order id (set after order creation)
  cf_link_id  text unique,                    -- Cashfree payment-link id (payment_link source)
  status      text not null default 'created'
                check (status in ('created','paid','failed','expired')),
  source      text not null default 'checkout'
                check (source in ('checkout','payment_link')),
  raw_event   jsonb                           -- last webhook payload (set by the webhook)
);

create index if not exists idx_pending_payments_clinic
  on pending_payments (clinic_id, created_at desc);

alter table pending_payments enable row level security;
alter table pending_payments force row level security;
drop policy if exists pending_payments_select on pending_payments;
create policy pending_payments_select on pending_payments for select to authenticated
  using (clinic_id = current_clinic_id());
-- No insert/update/delete policies → the clinic can read its own orders but never
-- write them. Writes go through start_cashfree_checkout (definer, below) and the
-- service role (cf_order_id write-back + the webhook).

-- ===========================================================================
-- 2. start_cashfree_checkout — file a PENDING order for the caller's clinic.
--    Reads the price from the DB (NEVER the client), guards against an unseeded
--    zero/null price, and returns what the server needs to create the Cashfree
--    order. Clinic is derived from the session — no client-supplied clinic_id.
-- ===========================================================================
create or replace function start_cashfree_checkout(
  p_kind   text,     -- 'plan' | 'pack'
  p_id     uuid,
  p_source text default 'checkout'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid;
  v_amount numeric(10,2);
  v_phone  text;
  v_pp     uuid;
begin
  if p_source not in ('checkout','payment_link') then
    raise exception 'invalid checkout source %', p_source;
  end if;

  v_clinic := current_clinic_id();
  if v_clinic is null then
    raise exception 'no clinic for current user';
  end if;

  if p_kind = 'plan' then
    select price_inr into v_amount from plans where id = p_id and is_active;
    if not found then raise exception 'plan not found'; end if;
  elsif p_kind = 'pack' then
    select price_inr into v_amount from credit_packs where id = p_id and is_active;
    if not found then raise exception 'pack not found'; end if;
  else
    raise exception 'invalid checkout kind %', p_kind;
  end if;

  -- Price-sanity guard: refuse to start an order for an unseeded/zero price so a
  -- misconfigured plan can't create a ₹0 (or NULL) Cashfree order.
  if v_amount is null or v_amount <= 0 then
    raise exception 'price not configured for this %', p_kind;
  end if;

  select phone into v_phone from clinics where id = v_clinic;

  insert into pending_payments (clinic_id, item_type, item_id, amount_inr, status, source)
  values (v_clinic, p_kind, p_id, v_amount, 'created', p_source)
  returning id into v_pp;

  return jsonb_build_object(
    'pending_payment_id', v_pp,
    'amount_inr',         v_amount,
    'clinic_id',          v_clinic,
    'customer_phone',     v_phone
  );
end;
$$;

revoke execute on function start_cashfree_checkout(text, uuid, text) from public, anon;
grant  execute on function start_cashfree_checkout(text, uuid, text) to authenticated;

-- ===========================================================================
-- 3. Route the customer-facing checkout to Cashfree by default.
--    New clinics default to 'cashfree'; existing 'manual' clinics are moved over
--    (the /upgrade Buy/Upgrade buttons now go to Cashfree). 'manual' stays a
--    valid value an admin can set per-clinic as a hand-onboarding escape hatch.
-- ===========================================================================
alter table clinics alter column billing_provider set default 'cashfree';
update clinics set billing_provider = 'cashfree' where billing_provider = 'manual';

-- ===========================================================================
-- 4. Register this migration.
-- ===========================================================================
insert into applied_migrations (version, name) values
  ('032','cashfree_checkout')
on conflict (version) do nothing;
