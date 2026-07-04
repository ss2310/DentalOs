-- 020_credit_engine.sql
-- Wires the balance-based credit model (migration 019) into the app: an atomic
-- spend/refund/grant engine over clinics.content_credits_balance /
-- map_credits_balance, plus the manual-checkout + admin-confirm billing flow.
--
-- MODEL NOTE — this SUPERSEDES the legacy counter model for the paid paths that
-- get rewired in app code (content generation, landing publish, campaign draft,
-- review insight → content credits; rank scan, prospect audit → map credits).
-- migration 015's reserve_credits/refund_credits + credit_transactions are left
-- in place (untouched) but are no longer used by those paths.
--
-- All writes to credit_ledger / clinic balances / billing_events go through the
-- SECURITY DEFINER functions below — never directly from a client (RLS + the 019
-- clinics column-lock forbid it). Mirrors the 015 reserve/refund safety:
-- check + write in one atomic, row-locked statement so concurrency can't overspend.
--
-- Idempotent: create-or-replace, add-column-if-not-exists, guarded constraint swap.
-- Requires 001 (clinics, current_clinic_id), 019 (balances, plans, credit_packs,
-- credit_ledger, billing_events), 004 (create_notification — used by signup, not here).

-- ---------------------------------------------------------------------------
-- 1. Allow a 'refund' reason on the ledger (spend-before + refund-on-failure).
-- ---------------------------------------------------------------------------
alter table credit_ledger drop constraint if exists credit_ledger_reason_check;
alter table credit_ledger add constraint credit_ledger_reason_check
  check (reason in
    ('trial_grant','topup','generation','map_scan','admin_adjust','monthly_reset','refund'));

-- ---------------------------------------------------------------------------
-- 2. Billing events — track a pending order + what it was for.
--    A manual checkout inserts a 'pending' row; admin confirm flips it to
--    'confirmed'. event_type stays 'payment_received' (plan) / 'topup' (pack).
-- ---------------------------------------------------------------------------
alter table billing_events add column if not exists status text not null default 'confirmed'
  check (status in ('pending','confirmed','cancelled'));
alter table billing_events add column if not exists plan_id uuid references plans (id);
alter table billing_events add column if not exists credit_pack_id uuid references credit_packs (id);

create index if not exists idx_billing_events_pending
  on billing_events (status, created_at desc) where status = 'pending';

-- ---------------------------------------------------------------------------
-- 3. spend_credits — atomic spend BEFORE a paid call (clinic-scoped).
--    Returns { ledger_id, balance_after } as jsonb, or NULL if the clinic can't
--    afford it (no row updated → nothing charged, no ledger row). The caller
--    treats NULL as "insufficient" and never proceeds. ledger_id is passed to
--    refund_credit_ledger if the paid call then fails. Mirrors reserve_credits.
-- ---------------------------------------------------------------------------
create or replace function spend_credits(
  p_kind       text,
  p_amount     integer,
  p_reason     text,
  p_related_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic  uuid;
  v_balance integer;
  v_id      uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid credit amount';
  end if;
  if p_kind not in ('content','map') then
    raise exception 'invalid credit kind %', p_kind;
  end if;

  v_clinic := current_clinic_id();
  if v_clinic is null then
    raise exception 'no clinic for current user';
  end if;

  -- Atomic: the row lock + the balance predicate mean two concurrent spends can
  -- never both pass. No row back = not enough credits.
  if p_kind = 'content' then
    update clinics set content_credits_balance = content_credits_balance - p_amount
     where id = v_clinic and content_credits_balance >= p_amount
    returning content_credits_balance into v_balance;
  else
    update clinics set map_credits_balance = map_credits_balance - p_amount
     where id = v_clinic and map_credits_balance >= p_amount
    returning map_credits_balance into v_balance;
  end if;

  if not found then
    return null;                          -- insufficient; nothing spent
  end if;

  insert into credit_ledger (clinic_id, kind, delta, reason, balance_after, related_id, created_by)
  values (v_clinic, p_kind, -p_amount, p_reason, v_balance, p_related_id, auth.uid())
  returning id into v_id;

  return jsonb_build_object('ledger_id', v_id, 'balance_after', v_balance);
end;
$$;

revoke execute on function spend_credits(text, integer, text, uuid) from public, anon;
grant  execute on function spend_credits(text, integer, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. refund_credit_ledger — reverse ONE prior spend whose paid call failed.
--    Only ever refunds a spend row in the caller's clinic, at most once. The
--    refund row's related_id points back at the spend it reverses, so a user
--    can't forge or replay refunds to mint credits. Returns the new balance,
--    or NULL if there was nothing to refund (no-op). Mirrors refund_credits.
-- ---------------------------------------------------------------------------
create or replace function refund_credit_ledger(
  p_ledger_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic  uuid;
  v_kind    text;
  v_delta   integer;
  v_balance integer;
begin
  v_clinic := current_clinic_id();
  if v_clinic is null then
    raise exception 'no clinic for current user';
  end if;

  -- The spend row, in THIS clinic (delta is negative for a spend).
  select kind, delta into v_kind, v_delta
    from credit_ledger
   where id = p_ledger_id and clinic_id = v_clinic;
  if not found or v_delta >= 0 then
    return null;                          -- no such spend → no-op
  end if;

  -- Already refunded? Don't double-credit.
  if exists (
    select 1 from credit_ledger
     where clinic_id = v_clinic and reason = 'refund' and related_id = p_ledger_id
  ) then
    return null;
  end if;

  -- Give back exactly what was taken (-v_delta is positive).
  if v_kind = 'content' then
    update clinics set content_credits_balance = content_credits_balance - v_delta
     where id = v_clinic returning content_credits_balance into v_balance;
  else
    update clinics set map_credits_balance = map_credits_balance - v_delta
     where id = v_clinic returning map_credits_balance into v_balance;
  end if;

  insert into credit_ledger (clinic_id, kind, delta, reason, balance_after, related_id, created_by)
  values (v_clinic, v_kind, -v_delta, 'refund', v_balance, p_ledger_id, auth.uid());

  return v_balance;
end;
$$;

revoke execute on function refund_credit_ledger(uuid) from public, anon;
grant  execute on function refund_credit_ledger(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. grant_credits — add credits to an EXPLICIT clinic (trial grant, plan/pack
--    top-up, admin adjust). service-role only: called by the signup flow and by
--    confirm_billing_event, never by a clinic user (who could otherwise self-grant).
-- ---------------------------------------------------------------------------
create or replace function grant_credits(
  p_clinic_id  uuid,
  p_kind       text,
  p_amount     integer,
  p_reason     text,
  p_related_id uuid default null,
  p_actor      uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid credit amount';
  end if;
  if p_kind not in ('content','map') then
    raise exception 'invalid credit kind %', p_kind;
  end if;

  if p_kind = 'content' then
    update clinics set content_credits_balance = content_credits_balance + p_amount
     where id = p_clinic_id returning content_credits_balance into v_balance;
  else
    update clinics set map_credits_balance = map_credits_balance + p_amount
     where id = p_clinic_id returning map_credits_balance into v_balance;
  end if;

  if not found then
    raise exception 'clinic not found %', p_clinic_id;
  end if;

  insert into credit_ledger (clinic_id, kind, delta, reason, balance_after, related_id, created_by)
  values (p_clinic_id, p_kind, p_amount, p_reason, v_balance, p_related_id, p_actor);

  return v_balance;
end;
$$;

revoke execute on function grant_credits(uuid, text, integer, text, uuid, uuid) from public, anon, authenticated;
grant  execute on function grant_credits(uuid, text, integer, text, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. start_manual_checkout — record a PENDING order for the caller's clinic.
--    Provider-agnostic 'manual' path: charges nothing, just files a pending
--    billing_events row an admin later confirms. Returns the event id.
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
    insert into billing_events (clinic_id, event_type, status, plan_id, amount_inr, provider, note)
    values (v_clinic, 'payment_received', 'pending', p_id, v_amount, 'manual',
            'Manual checkout — awaiting confirmation')
    returning id into v_id;
  elsif p_kind = 'pack' then
    select price_inr into v_amount from credit_packs where id = p_id and is_active;
    if not found then raise exception 'pack not found'; end if;
    insert into billing_events (clinic_id, event_type, status, credit_pack_id, amount_inr, provider, note)
    values (v_clinic, 'topup', 'pending', p_id, v_amount, 'manual',
            'Manual checkout — awaiting confirmation')
    returning id into v_id;
  else
    raise exception 'invalid checkout kind %', p_kind;
  end if;

  return v_id;
end;
$$;

revoke execute on function start_manual_checkout(text, uuid) from public, anon;
grant  execute on function start_manual_checkout(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. confirm_billing_event — activate a plan / apply a top-up for a pending
--    order, atomically. service-role only (called from an admin-verified
--    server action). Row-locks the event so it can't be double-confirmed.
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

revoke execute on function confirm_billing_event(uuid, uuid) from public, anon, authenticated;
grant  execute on function confirm_billing_event(uuid, uuid) to service_role;
