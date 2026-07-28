-- 054_zero_price_checkout_guard.sql
-- Close the ₹0 upgrade hole.
--
-- THE BUG
-- -------
-- The seeded "Free Trial" plan (019: price_inr 0, billing_period 'trial',
-- is_active true) was rendered by /upgrade as a purchasable card with a working
-- Upgrade button, because that page filtered on is_active ONLY. Clicking it ran
-- start_manual_checkout, which had NO price guard, filing a ₹0 'pending' order.
-- Confirming that order runs confirm_billing_event, which sets
-- subscription_status='active', pushes current_period_end a month out and grants
-- the plan's credits — with no price check anywhere. Repeatable.
--
-- Cashfree was safe BY ACCIDENT: start_cashfree_checkout (032:91-95) and
-- start_payment_link (034:149-151) both already raise on a null/<=0 amount.
-- start_manual_checkout was the one starter that never got that guard. This
-- migration gives it the same one, word for word, and then adds a second guard
-- at the point where money actually turns into entitlement.
--
-- THREE LAYERS, ON PURPOSE
--   1. is_active=false on the trial plan  — removes it from every catalog and
--      from all three starters, which each filter `and is_active`.
--   2. start_manual_checkout price guard  — a ₹0 order cannot be FILED.
--      Catches any future mis-seeded plan, not just this one row.
--   3. confirm_billing_event price guard  — a ₹0 order cannot be HONOURED,
--      whatever filed it. This is the one that matters: it is the single
--      chokepoint every provider's confirm path funnels through, so no future
--      caller can grant a paid period for nothing.
--   The UI filter in app/(app)/upgrade/page.tsx is a fourth layer and the
--   weakest — hiding a button is not a fix. These are.
--
-- ⚠️ confirm_billing_event's LATEST body is in 033_cashfree_webhook.sql:210,
-- NOT 020_credit_engine.sql:269. 033 replaced the inline plan/pack logic with
-- the shared apply_plan_purchase / apply_pack_purchase cores plus create_invoice.
-- The body below is 033's, verbatim, with ONLY the guard added — rebuilding it
-- from the 020 body would silently revert invoice generation.
--
-- NOT guarded, deliberately: admin_activate_plan (033:193). That is an explicit
-- super-admin comp, not a purchase, and it never routes through
-- confirm_billing_event. Comping an account must stay possible.
--
-- Idempotent: create-or-replace + a WHERE-scoped update. Safe to re-run.
-- Requires 019 (plans), 020 (start_manual_checkout), 033 (apply_* cores,
-- create_invoice, current confirm_billing_event).

-- ---------------------------------------------------------------------------
-- 1. Take the trial plan out of every purchasable catalog.
--    Scoped by billing_period, not by name, so a renamed row is still caught.
--    SAFE FOR SIGNUP: app/signup/actions.ts looks the row up by
--    `.eq("name","Free Trial")` with NO is_active filter, so new clinics still
--    get their trial plan_id. Verified before writing this.
-- ---------------------------------------------------------------------------
update plans
   set is_active = false
 where billing_period = 'trial'
   and is_active;

-- ---------------------------------------------------------------------------
-- 2. start_manual_checkout — 020's body plus the 032/034 price guard.
-- ---------------------------------------------------------------------------
create or replace function start_manual_checkout(
  p_kind text,     -- 'plan' | 'pack'
  p_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid;
  v_amount numeric(10,2);
  v_id     uuid;
begin
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
  -- misconfigured plan can't create a ₹0 order. Mirrors start_cashfree_checkout
  -- (032:91-95) and start_payment_link (034:149-151) exactly.
  if v_amount is null or v_amount <= 0 then
    raise exception 'price not configured for this %', p_kind;
  end if;

  if p_kind = 'plan' then
    insert into billing_events (clinic_id, event_type, status, plan_id, amount_inr, provider, note)
    values (v_clinic, 'payment_received', 'pending', p_id, v_amount, 'manual',
            'Manual checkout — awaiting confirmation')
    returning id into v_id;
  else
    insert into billing_events (clinic_id, event_type, status, credit_pack_id, amount_inr, provider, note)
    values (v_clinic, 'topup', 'pending', p_id, v_amount, 'manual',
            'Manual checkout — awaiting confirmation')
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke execute on function start_manual_checkout(text, uuid) from public, anon;
grant  execute on function start_manual_checkout(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. confirm_billing_event — 033's body, verbatim, plus the price guard.
--    This is the real fix: whatever files the order, nothing grants a paid
--    period or credits for ₹0.
-- ---------------------------------------------------------------------------
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

  -- Price-sanity guard. A pending row is only ever created by a checkout
  -- starter, and all three now refuse a null/<=0 amount — but this is the
  -- chokepoint every provider funnels through, so it is guarded independently
  -- of who filed the row. An admin COMP does not come through here; it uses
  -- admin_activate_plan, which is intentionally left unguarded.
  if v_evt.amount_inr is null or v_evt.amount_inr <= 0 then
    raise exception 'refusing to confirm a zero-amount billing event %', p_event_id;
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
