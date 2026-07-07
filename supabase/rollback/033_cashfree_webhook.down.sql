-- rollback for 033_cashfree_webhook.sql
-- Drops the webhook fulfillment surface and RESTORES admin_activate_plan (022)
-- and confirm_billing_event (020) to their pre-033 bodies. Leaves invoices data
-- untouched if you'd rather keep it — drop the tables manually if you want them
-- gone (commented below).

drop function if exists confirm_cashfree_payment(uuid, text, text, jsonb);
drop function if exists fail_cashfree_payment(uuid, text, jsonb);

-- Restore admin_activate_plan to its 022 body (inline, no shared core / invoice).
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

  insert into billing_events (clinic_id, event_type, status, plan_id, amount_inr, provider, note, actor)
  values (p_clinic, 'payment_received', 'confirmed', v_plan.id, v_plan.price_inr, 'manual',
          'Admin marked as paid — activated ' || v_plan.name, p_actor);
end;
$$;

-- Restore confirm_billing_event to its 020 body (inline plan/pack, no invoice).
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
  v_plan plans%rowtype;
  v_pack credit_packs%rowtype;
begin
  select * into v_evt from billing_events
   where id = p_event_id and status = 'pending'
   for update;
  if not found then
    raise exception 'no pending billing event %', p_event_id;
  end if;

  if v_evt.plan_id is not null then
    select * into v_plan from plans where id = v_evt.plan_id;
    if not found then raise exception 'plan not found'; end if;

    update clinics set
      subscription_status = 'active',
      plan_id             = v_plan.id,
      current_period_end  = now() + case when v_plan.billing_period = 'annual'
                                         then interval '1 year' else interval '1 month' end,
      last_payment_at     = now(),
      is_active           = true
     where id = v_evt.clinic_id;

    if v_plan.content_credits > 0 then
      perform grant_credits(v_evt.clinic_id, 'content', v_plan.content_credits, 'topup', p_event_id, p_actor);
    end if;
    if v_plan.map_credits > 0 then
      perform grant_credits(v_evt.clinic_id, 'map', v_plan.map_credits, 'topup', p_event_id, p_actor);
    end if;

    update billing_events set status = 'confirmed', actor = p_actor where id = p_event_id;

  elsif v_evt.credit_pack_id is not null then
    select * into v_pack from credit_packs where id = v_evt.credit_pack_id;
    if not found then raise exception 'credit pack not found'; end if;

    if v_pack.content_credits > 0 then
      perform grant_credits(v_evt.clinic_id, 'content', v_pack.content_credits, 'topup', p_event_id, p_actor);
    end if;
    if v_pack.map_credits > 0 then
      perform grant_credits(v_evt.clinic_id, 'map', v_pack.map_credits, 'topup', p_event_id, p_actor);
    end if;

    update clinics set last_payment_at = now() where id = v_evt.clinic_id;
    update billing_events set status = 'confirmed', actor = p_actor where id = p_event_id;

  else
    raise exception 'billing event % has neither plan nor pack', p_event_id;
  end if;
end;
$$;

drop function if exists apply_plan_purchase(uuid, uuid, uuid);
drop function if exists apply_pack_purchase(uuid, uuid, uuid);
drop function if exists create_invoice(uuid, numeric, text, text, uuid);

-- Invoice data is preserved by default. Uncomment to remove entirely:
-- drop table if exists invoices;
-- drop table if exists invoice_counters;

-- Restore the pre-033 event_type CHECK (drops 'payment_failed','webhook_orphan').
-- Rows using those types must be removed first or this ALTER fails.
alter table billing_events drop constraint if exists billing_events_event_type_check;
alter table billing_events add constraint billing_events_event_type_check
  check (event_type in (
    'trial_started','payment_received','plan_changed','past_due',
    'deactivated','reactivated','topup','trial_extended','credit_grant',
    'plan_price_changed','pack_price_changed'));

delete from applied_migrations where version = '033';
