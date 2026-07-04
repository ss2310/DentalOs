-- 033_cashfree_webhook.sql
-- Fulfillment for verified Cashfree webhooks: turns a paid pending_payments row
-- into product access (plan/credits) atomically and idempotently, records a
-- durable invoice, and notifies the clinic. Also UNIFIES the two confirmation
-- paths (admin "Mark as Paid" + manual-checkout confirm) onto shared cores so the
-- webhook runs the exact same logic and the three can never drift.
--
-- CORRECTNESS NOTES
--  * confirm_cashfree_payment is the ONLY money-into-access path for the gateway.
--    It row-locks the pending order and flips status created→paid guarded by
--    `status <> 'paid'`, so at-least-once webhook retries fulfill exactly once.
--  * apply_plan_purchase / apply_pack_purchase hold the shared mutation+credit
--    logic (write NO billing_events); each caller writes its own billing_events
--    row (right provider/note/actor) and an invoice.
--  * create_invoice numbers sequentially per IST year (GOS-YYYY-NNNN) via an
--    upsert-locked counter — race-safe, gap-free.
--
-- Idempotent: create-or-replace, create-if-not-exists, guarded constraint swap.
-- Requires 019 (billing_events, plans, credit_packs), 020 (grant_credits,
-- confirm_billing_event), 021 (past_due_since), 022 (admin_activate_plan),
-- 030 (billing_events.clinic_id nullable), 032 (pending_payments), 004
-- (create_notification), 031 (applied_migrations).
-- ⚠️ DDL — run by hand in the Supabase SQL editor.

-- ===========================================================================
-- 1. Allow the two webhook billing_events types (failed + orphan).
--    Full list restated (019 + 022 + 030 + these two).
-- ===========================================================================
alter table billing_events drop constraint if exists billing_events_event_type_check;
alter table billing_events add constraint billing_events_event_type_check
  check (event_type in (
    'trial_started','payment_received','plan_changed','past_due',
    'deactivated','reactivated','topup','trial_extended','credit_grant',
    'plan_price_changed','pack_price_changed',
    'payment_failed','webhook_orphan'));

-- ===========================================================================
-- 2. INVOICES — durable, sequentially-numbered record per successful payment.
--    No PDF yet; this just guarantees numbering is never retro-fitted for GST.
-- ===========================================================================
create table if not exists invoices (
  id                 uuid primary key default gen_random_uuid(),
  clinic_id          uuid not null references clinics (id) on delete cascade,
  created_at         timestamptz not null default now(),
  invoice_number     text not null unique,          -- GOS-YYYY-NNNN
  amount_inr         numeric(10,2) not null,
  item_description   text not null,
  cf_payment_id      text,                           -- null for admin/manual fulfillment
  pending_payment_id uuid references pending_payments (id) on delete set null
);

create index if not exists idx_invoices_clinic on invoices (clinic_id, created_at desc);

alter table invoices enable row level security;
alter table invoices force row level security;
drop policy if exists invoices_select on invoices;
create policy invoices_select on invoices for select to authenticated
  using (clinic_id = current_clinic_id());
-- No write policies → written only by create_invoice (definer) / service role.

-- Per-year sequence backing GOS-YYYY-NNNN. Client-inaccessible.
create table if not exists invoice_counters (
  year int primary key,
  seq  int not null default 0
);
alter table invoice_counters enable row level security;
alter table invoice_counters force row level security;
-- No policies at all → clients denied entirely; definer functions bypass.

-- create_invoice — atomic per-year sequential number + the invoice row.
create or replace function create_invoice(
  p_clinic        uuid,
  p_amount        numeric,
  p_description   text,
  p_cf_payment_id text,
  p_pending_id    uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year   int;
  v_seq    int;
  v_number text;
begin
  v_year := extract(year from (now() at time zone 'Asia/Kolkata'))::int;

  -- Upsert locks the counter row → concurrent invoices serialize, no gaps/dupes.
  insert into invoice_counters (year, seq) values (v_year, 1)
  on conflict (year) do update set seq = invoice_counters.seq + 1
  returning seq into v_seq;

  v_number := 'GOS-' || v_year || '-' || lpad(v_seq::text, 4, '0');

  insert into invoices (clinic_id, invoice_number, amount_inr, item_description, cf_payment_id, pending_payment_id)
  values (p_clinic, v_number, p_amount, p_description, p_cf_payment_id, p_pending_id);

  return v_number;
end;
$$;

revoke execute on function create_invoice(uuid, numeric, text, text, uuid) from public, anon, authenticated;
grant  execute on function create_invoice(uuid, numeric, text, text, uuid) to service_role;

-- ===========================================================================
-- 3. SHARED CONFIRMATION CORES — the one place plan/pack fulfillment lives.
--    Write NO billing_events; the caller owns that (provider/note/actor differ).
-- ===========================================================================

-- Apply a plan purchase: activate + set period + top up plan credits.
create or replace function apply_plan_purchase(p_clinic uuid, p_plan uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan plans%rowtype;
begin
  select * into v_plan from plans where id = p_plan;
  if not found then raise exception 'plan not found'; end if;

  update clinics set
    subscription_status = 'active',
    plan_id             = v_plan.id,
    current_period_end  = now() + case when v_plan.billing_period = 'annual'
                                       then interval '1 year' else interval '1 month' end,
    last_payment_at     = now(),
    is_active           = true,
    past_due_since      = null
   where id = p_clinic;
  if not found then raise exception 'clinic not found'; end if;

  if v_plan.content_credits > 0 then
    perform grant_credits(p_clinic, 'content', v_plan.content_credits, 'topup', null, p_actor);
  end if;
  if v_plan.map_credits > 0 then
    perform grant_credits(p_clinic, 'map', v_plan.map_credits, 'topup', null, p_actor);
  end if;
end;
$$;

revoke execute on function apply_plan_purchase(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function apply_plan_purchase(uuid, uuid, uuid) to service_role;

-- Apply a credit-pack purchase: top up pack credits + stamp last_payment_at.
create or replace function apply_pack_purchase(p_clinic uuid, p_pack uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pack credit_packs%rowtype;
begin
  select * into v_pack from credit_packs where id = p_pack;
  if not found then raise exception 'credit pack not found'; end if;

  if v_pack.content_credits > 0 then
    perform grant_credits(p_clinic, 'content', v_pack.content_credits, 'topup', null, p_actor);
  end if;
  if v_pack.map_credits > 0 then
    perform grant_credits(p_clinic, 'map', v_pack.map_credits, 'topup', null, p_actor);
  end if;

  update clinics set last_payment_at = now() where id = p_clinic;
  if not found then raise exception 'clinic not found'; end if;
end;
$$;

revoke execute on function apply_pack_purchase(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function apply_pack_purchase(uuid, uuid, uuid) to service_role;

-- ===========================================================================
-- 4. REFACTOR the two existing confirmation paths onto the shared cores.
--    Behavior preserved; each now also records an invoice.
-- ===========================================================================

-- Admin "Mark as Paid" (022) → shared core + invoice + its manual billing_events.
create or replace function admin_activate_plan(
  p_clinic uuid, p_plan uuid, p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan plans%rowtype;
begin
  select * into v_plan from plans where id = p_plan;
  if not found then raise exception 'plan not found'; end if;

  perform apply_plan_purchase(p_clinic, p_plan, p_actor);

  insert into billing_events (clinic_id, event_type, status, plan_id, amount_inr, provider, note, actor)
  values (p_clinic, 'payment_received', 'confirmed', v_plan.id, v_plan.price_inr, 'manual',
          'Admin marked as paid — activated ' || v_plan.name, p_actor);

  perform create_invoice(p_clinic, v_plan.price_inr, v_plan.name, null, null);
end;
$$;

revoke execute on function admin_activate_plan(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function admin_activate_plan(uuid, uuid, uuid) to service_role;

-- Manual-checkout confirm (020) → shared cores + invoice; confirms the pending row.
create or replace function confirm_billing_event(
  p_event_id uuid,
  p_actor    uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evt  billing_events%rowtype;
  v_desc text;
begin
  select * into v_evt from billing_events
   where id = p_event_id and status = 'pending'
   for update;
  if not found then
    raise exception 'no pending billing event %', p_event_id;
  end if;

  if v_evt.plan_id is not null then
    perform apply_plan_purchase(v_evt.clinic_id, v_evt.plan_id, p_actor);
    select name into v_desc from plans where id = v_evt.plan_id;
    perform create_invoice(v_evt.clinic_id, v_evt.amount_inr, v_desc, null, null);
    update billing_events set status = 'confirmed', actor = p_actor where id = p_event_id;

  elsif v_evt.credit_pack_id is not null then
    perform apply_pack_purchase(v_evt.clinic_id, v_evt.credit_pack_id, p_actor);
    select name into v_desc from credit_packs where id = v_evt.credit_pack_id;
    perform create_invoice(v_evt.clinic_id, v_evt.amount_inr, v_desc, null, null);
    update billing_events set status = 'confirmed', actor = p_actor where id = p_event_id;

  else
    raise exception 'billing event % has neither plan nor pack', p_event_id;
  end if;
end;
$$;

revoke execute on function confirm_billing_event(uuid, uuid) from public, anon, authenticated;
grant  execute on function confirm_billing_event(uuid, uuid) to service_role;

-- ===========================================================================
-- 5. WEBHOOK FULFILLMENT — the gateway money-into-access path.
--    Returns 'fulfilled' | 'already_paid' | 'orphan'. Idempotent + atomic.
-- ===========================================================================
create or replace function confirm_cashfree_payment(
  p_order_id      uuid,
  p_cf_payment_id text,
  p_customer_id   text,
  p_raw           jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pp   pending_payments%rowtype;
  v_desc text;
begin
  select * into v_pp from pending_payments where id = p_order_id for update;

  -- Unknown order → audit an orphan and stop (clinic_id nullable since 030).
  if not found then
    insert into billing_events (clinic_id, event_type, provider, note)
    values (null, 'webhook_orphan', 'cashfree',
            'Orphan webhook — unknown order ' || p_order_id::text ||
            coalesce(' (cf_payment ' || p_cf_payment_id || ')', ''));
    return 'orphan';
  end if;

  -- Already fulfilled → idempotent no-op (safe for at-least-once retries).
  if v_pp.status = 'paid' then
    return 'already_paid';
  end if;

  -- Flip created/failed → paid, guarded so a concurrent retry can't double-apply.
  update pending_payments
     set status = 'paid', raw_event = p_raw
   where id = p_order_id and status <> 'paid';
  if not found then
    return 'already_paid';
  end if;

  -- Fulfill via the SAME shared cores as admin/manual confirmation.
  if v_pp.item_type = 'plan' then
    perform apply_plan_purchase(v_pp.clinic_id, v_pp.item_id, null);
    select name into v_desc from plans where id = v_pp.item_id;
    insert into billing_events (clinic_id, event_type, status, plan_id, amount_inr, provider, note)
    values (v_pp.clinic_id, 'payment_received', 'confirmed', v_pp.item_id, v_pp.amount_inr, 'cashfree',
            'Cashfree payment ' || coalesce(p_cf_payment_id, '?'));
  else
    perform apply_pack_purchase(v_pp.clinic_id, v_pp.item_id, null);
    select name into v_desc from credit_packs where id = v_pp.item_id;
    insert into billing_events (clinic_id, event_type, status, credit_pack_id, amount_inr, provider, note)
    values (v_pp.clinic_id, 'topup', 'confirmed', v_pp.item_id, v_pp.amount_inr, 'cashfree',
            'Cashfree payment ' || coalesce(p_cf_payment_id, '?'));
  end if;

  -- Record the gateway on the clinic for future reference.
  update clinics set
    billing_provider     = 'cashfree',
    provider_customer_id = coalesce(p_customer_id, provider_customer_id)
   where id = v_pp.clinic_id;

  perform create_invoice(v_pp.clinic_id, v_pp.amount_inr, coalesce(v_desc, 'Purchase'),
                         p_cf_payment_id, v_pp.id);

  perform create_notification(
    v_pp.clinic_id, 'system', 'important',
    'Payment received — your account is active 🎉',
    'Your plan and credits have been applied.',
    '/upgrade');

  return 'fulfilled';
end;
$$;

revoke execute on function confirm_cashfree_payment(uuid, text, text, jsonb) from public, anon, authenticated;
grant  execute on function confirm_cashfree_payment(uuid, text, text, jsonb) to service_role;

-- ===========================================================================
-- 6. WEBHOOK FAILURE — mark a dropped/failed order, never a paid one.
--    Returns 'failed' | 'already_paid' | 'orphan'.
-- ===========================================================================
create or replace function fail_cashfree_payment(
  p_order_id uuid,
  p_reason   text,
  p_raw      jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid;
  v_status text;
begin
  select clinic_id, status into v_clinic, v_status
    from pending_payments where id = p_order_id for update;
  if not found then
    return 'orphan';
  end if;
  if v_status = 'paid' then
    return 'already_paid';   -- a real success already won; don't override it
  end if;

  update pending_payments set status = 'failed', raw_event = p_raw where id = p_order_id;

  insert into billing_events (clinic_id, event_type, provider, note)
  values (v_clinic, 'payment_failed', 'cashfree', 'Payment ' || coalesce(p_reason, 'failed'));

  return 'failed';
end;
$$;

revoke execute on function fail_cashfree_payment(uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function fail_cashfree_payment(uuid, text, jsonb) to service_role;

-- ===========================================================================
-- 7. Register this migration.
-- ===========================================================================
insert into applied_migrations (version, name) values
  ('033','cashfree_webhook')
on conflict (version) do nothing;
