-- 034_payment_links.sql
-- Cashfree Payment Links from the admin panel + platform payment visibility.
-- Admins send a hosted link for a plan/pack; the customer pays it; the SAME
-- payment webhook (C2) fulfills it. Adds the money feed (admin_payments_feed),
-- overview revenue/link cards, and a paid_at stamp for reporting.
--
-- LINK → WEBHOOK MAPPING — a link payment's webhook carries the link id in
-- data.order.order_tags.cf_link_id (Cashfree injects it). We store cf_link_id on
-- pending_payments at send time, and confirm_cashfree_payment resolves the row by
-- cf_link_id when present (else by id, the hosted-checkout path). Same idempotent,
-- shared-core fulfillment + invoice + notification as C2.
--
-- Idempotent: create-or-replace, add-column-if-not-exists, guarded constraint
-- swap. Requires 020/022/030 (billing/admin fns), 032 (pending_payments,
-- cf_link_id), 033 (confirm_cashfree_payment, invoices, shared cores).
-- ⚠️ DDL — run by hand in the Supabase SQL editor.

-- ===========================================================================
-- 1. Allow the 'payment_link_sent' billing event (full list restated).
-- ===========================================================================
alter table billing_events drop constraint if exists billing_events_event_type_check;
alter table billing_events add constraint billing_events_event_type_check
  check (event_type in (
    'trial_started','payment_received','plan_changed','past_due',
    'deactivated','reactivated','topup','trial_extended','credit_grant',
    'plan_price_changed','pack_price_changed',
    'payment_failed','webhook_orphan','payment_link_sent'));

-- ===========================================================================
-- 2. paid_at on pending_payments (money feed needs the paid time).
-- ===========================================================================
alter table pending_payments add column if not exists paid_at timestamptz;

-- ===========================================================================
-- 3. Extend confirm_cashfree_payment: resolve by cf_link_id (link payments) or
--    id (checkout), and stamp paid_at. Signature changes (adds p_cf_link_id), so
--    drop the 033 version first.
-- ===========================================================================
drop function if exists confirm_cashfree_payment(uuid, text, text, jsonb);

create or replace function confirm_cashfree_payment(
  p_order_id      uuid,
  p_cf_link_id    text,
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
  -- Link payment → find by cf_link_id; hosted checkout → find by our order id.
  if p_cf_link_id is not null and p_cf_link_id <> '' then
    select * into v_pp from pending_payments where cf_link_id = p_cf_link_id for update;
  else
    select * into v_pp from pending_payments where id = p_order_id for update;
  end if;

  if not found then
    insert into billing_events (clinic_id, event_type, provider, note)
    values (null, 'webhook_orphan', 'cashfree',
            'Orphan webhook — order ' || coalesce(p_order_id::text, '?') ||
            coalesce(' / link ' || p_cf_link_id, '') ||
            coalesce(' (cf_payment ' || p_cf_payment_id || ')', ''));
    return 'orphan';
  end if;

  if v_pp.status = 'paid' then
    return 'already_paid';
  end if;

  update pending_payments
     set status = 'paid', paid_at = now(), raw_event = p_raw
   where id = v_pp.id and status <> 'paid';
  if not found then
    return 'already_paid';
  end if;

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

revoke execute on function confirm_cashfree_payment(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant  execute on function confirm_cashfree_payment(uuid, text, text, text, jsonb) to service_role;

-- ===========================================================================
-- 4. admin_start_payment_link — file a pending 'payment_link' row for a clinic.
--    Cross-tenant (admin), so p_clinic is explicit (NOT current_clinic_id). Price
--    from DB + guard; returns what the action needs to create the Cashfree link.
-- ===========================================================================
create or replace function admin_start_payment_link(
  p_clinic uuid, p_kind text, p_id uuid, p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(10,2);
  v_name   text;
  v_phone  text;
  v_email  text;
  v_pp     uuid;
begin
  if p_kind = 'plan' then
    select price_inr, name into v_amount, v_name from plans where id = p_id and is_active;
    if not found then raise exception 'plan not found'; end if;
  elsif p_kind = 'pack' then
    select price_inr, name into v_amount, v_name from credit_packs where id = p_id and is_active;
    if not found then raise exception 'pack not found'; end if;
  else
    raise exception 'invalid kind %', p_kind;
  end if;

  if v_amount is null or v_amount <= 0 then
    raise exception 'price not configured for this %', p_kind;
  end if;

  select phone into v_phone from clinics where id = p_clinic;
  if not found then raise exception 'clinic not found'; end if;

  -- Owner email (auth.users only reachable inside a definer fn).
  select u.email into v_email
    from profiles p join auth.users u on u.id = p.id
   where p.home_clinic_id = p_clinic and p.role = 'clinic_owner'
   order by u.created_at asc
   limit 1;

  insert into pending_payments (clinic_id, item_type, item_id, amount_inr, status, source)
  values (p_clinic, p_kind, p_id, v_amount, 'created', 'payment_link')
  returning id into v_pp;

  return jsonb_build_object(
    'pending_payment_id', v_pp,
    'amount_inr',         v_amount,
    'item_type',          p_kind,
    'item_name',          v_name,
    'customer_phone',     v_phone,
    'customer_email',     v_email
  );
end;
$$;

revoke execute on function admin_start_payment_link(uuid, text, uuid, uuid) from public, anon, authenticated;
grant  execute on function admin_start_payment_link(uuid, text, uuid, uuid) to service_role;

-- ===========================================================================
-- 5. admin_finalize_payment_link — store cf_link_id + audit the send.
-- ===========================================================================
create or replace function admin_finalize_payment_link(
  p_pending_id uuid, p_cf_link_id text, p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid;
  v_type   text;
  v_item   uuid;
  v_name   text;
begin
  update pending_payments set cf_link_id = p_cf_link_id
   where id = p_pending_id
  returning clinic_id, item_type, item_id into v_clinic, v_type, v_item;
  if not found then raise exception 'pending payment not found'; end if;

  if v_type = 'plan' then
    select name into v_name from plans where id = v_item;
  else
    select name into v_name from credit_packs where id = v_item;
  end if;

  insert into billing_events (clinic_id, event_type, provider, note, actor)
  values (v_clinic, 'payment_link_sent', 'cashfree',
          'Sent payment link for ' || coalesce(v_name, 'purchase'), p_actor);
end;
$$;

revoke execute on function admin_finalize_payment_link(uuid, text, uuid) from public, anon, authenticated;
grant  execute on function admin_finalize_payment_link(uuid, text, uuid) to service_role;

-- ===========================================================================
-- 6. admin_payments_feed — every pending_payments row, cross-tenant, for the
--    /admin/payments money feed.
-- ===========================================================================
create or replace function admin_payments_feed()
returns table (
  id            uuid,
  clinic_id     uuid,
  clinic_name   text,
  item_type     text,
  item_name     text,
  amount_inr    numeric,
  source        text,
  status        text,
  cf_id         text,
  created_at    timestamptz,
  paid_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pp.id,
    pp.clinic_id,
    c.business_name,
    pp.item_type,
    case when pp.item_type = 'plan'
         then (select name from plans where id = pp.item_id)
         else (select name from credit_packs where id = pp.item_id) end,
    pp.amount_inr,
    pp.source,
    pp.status,
    coalesce(pp.cf_order_id, pp.cf_link_id),
    pp.created_at,
    pp.paid_at
  from pending_payments pp
  join clinics c on c.id = pp.clinic_id
  order by pp.created_at desc;
$$;

revoke execute on function admin_payments_feed() from public, anon, authenticated;
grant  execute on function admin_payments_feed() to service_role;

-- ===========================================================================
-- 7. Extend admin_overview_stats: + revenue_month (paid gateway payments this
--    IST month) + pending_links (outstanding sent links). Whole fn restated.
-- ===========================================================================
create or replace function admin_overview_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total_clinics', (select count(*) from clinics),
    'trial',        (select count(*) from clinics where subscription_status = 'trial'),
    'active',       (select count(*) from clinics where subscription_status = 'active'),
    'past_due',     (select count(*) from clinics where subscription_status = 'past_due'),
    'deactivated',  (select count(*) from clinics where subscription_status = 'deactivated'),
    'mrr', (
      select coalesce(sum(pl.price_inr), 0)
        from clinics c join plans pl on pl.id = c.plan_id
       where c.subscription_status = 'active'
    ),
    'content_consumed_month', (
      select coalesce(-sum(delta), 0) from credit_ledger
       where reason = 'generation'
         and created_at >= (date_trunc('month', (now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata')
    ),
    'map_consumed_month', (
      select coalesce(-sum(delta), 0) from credit_ledger
       where reason = 'map_scan'
         and created_at >= (date_trunc('month', (now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata')
    ),
    'signups_week', (
      select count(*) from clinics where created_at >= now() - interval '7 days'
    ),
    -- Gateway revenue collected this IST month (paid pending_payments).
    'revenue_month', (
      select coalesce(sum(amount_inr), 0) from pending_payments
       where status = 'paid'
         and paid_at >= (date_trunc('month', (now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata')
    ),
    -- Sent payment links still awaiting payment.
    'pending_links', (
      select count(*) from pending_payments
       where source = 'payment_link' and status = 'created'
    )
  );
$$;

revoke execute on function admin_overview_stats() from public, anon, authenticated;
grant  execute on function admin_overview_stats() to service_role;

-- ===========================================================================
-- 8. Register this migration.
-- ===========================================================================
insert into applied_migrations (version, name) values
  ('034','payment_links')
on conflict (version) do nothing;
