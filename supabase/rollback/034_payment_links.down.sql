-- rollback for 034_payment_links.sql
-- Restores confirm_cashfree_payment (033, no cf_link_id) and admin_overview_stats
-- (022, no revenue/link cards), drops the payment-link admin fns + money feed,
-- and removes paid_at + the payment_link_sent event type.

drop function if exists admin_start_payment_link(uuid, text, uuid, uuid);
drop function if exists admin_finalize_payment_link(uuid, text, uuid);
drop function if exists admin_payments_feed();

-- Restore confirm_cashfree_payment to its 033 (4-arg) form.
drop function if exists confirm_cashfree_payment(uuid, text, text, text, jsonb);
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

  if not found then
    insert into billing_events (clinic_id, event_type, provider, note)
    values (null, 'webhook_orphan', 'cashfree',
            'Orphan webhook — unknown order ' || p_order_id::text ||
            coalesce(' (cf_payment ' || p_cf_payment_id || ')', ''));
    return 'orphan';
  end if;

  if v_pp.status = 'paid' then
    return 'already_paid';
  end if;

  update pending_payments
     set status = 'paid', raw_event = p_raw
   where id = p_order_id and status <> 'paid';
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
revoke execute on function confirm_cashfree_payment(uuid, text, text, jsonb) from public, anon, authenticated;
grant  execute on function confirm_cashfree_payment(uuid, text, text, jsonb) to service_role;

-- Restore admin_overview_stats to its 022 form (no revenue_month / pending_links).
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
    )
  );
$$;
revoke execute on function admin_overview_stats() from public, anon, authenticated;
grant  execute on function admin_overview_stats() to service_role;

alter table pending_payments drop column if exists paid_at;

-- Restore the pre-034 event_type CHECK (drops 'payment_link_sent'). Remove any
-- such rows first if this ALTER fails.
alter table billing_events drop constraint if exists billing_events_event_type_check;
alter table billing_events add constraint billing_events_event_type_check
  check (event_type in (
    'trial_started','payment_received','plan_changed','past_due',
    'deactivated','reactivated','topup','trial_extended','credit_grant',
    'plan_price_changed','pack_price_changed',
    'payment_failed','webhook_orphan'));

delete from applied_migrations where version = '034';
