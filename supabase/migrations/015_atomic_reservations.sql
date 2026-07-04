-- ============================================================
-- GrowthOS — 015: atomic credit + SERP reservations
--
-- Fixes the TOCTOU races on every paid path (SEC-H1, SEC-L1, SEC-M1).
-- The old shape was "read usage → check limit → do expensive call →
-- write usage": N concurrent requests all pass the check and last-write
-- wins, so N paid operations are charged as ONE. This migration moves
-- the check + the write into a single atomic SQL step that runs BEFORE
-- the paid call, mirroring the existing record_payment() pattern
-- (SECURITY DEFINER, re-derives identity server-side, raises on abuse).
--
-- Credits are a counter model (clinics.credits_used vs monthly_credits),
-- NOT a balance column — so the atomic guard is
--   UPDATE ... SET credits_used = credits_used + p_cost
--   WHERE id = <clinic> AND credits_used + p_cost <= monthly_credits
-- which locks the row and can never overspend under concurrency.
--
-- SERP scans/audits are capped by ROW COUNT per month, so there is no
-- single row to guard — we serialize per clinic/user with a transaction
-- advisory lock, count, then insert a 'reserved' row up front. The paid
-- provider calls only run after the quota slot is taken.
--
-- IDEMPOTENT: create-if-not-exists, create-or-replace, add-column-if-not.
-- Requires 001 (clinics, current_clinic_id), 007 (rank_scans,
-- prospect_audits, is_agency).
-- ============================================================

-- ------------------------------------------------------------
-- 1. CREDIT LEDGER
-- ------------------------------------------------------------
-- Append-only audit trail. Written ONLY by the SECURITY DEFINER functions
-- below (which bypass RLS); authenticated users may read their clinic's
-- rows but never write them directly. `kind` + `reference_id` let a refund
-- be matched to exactly one prior reserve, so refunds can't be forged or
-- replayed to mint free credits.
create table if not exists credit_transactions (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references clinics (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null,
  amount       integer not null,                    -- <0 reserve, >0 refund
  kind         text not null check (kind in ('reserve', 'refund')),
  reason       text not null,                        -- 'content_generation' | ...
  reference_id uuid not null,                        -- 1 per paid operation
  created_at   timestamptz not null default now()
);

create index if not exists idx_credit_tx_clinic
  on credit_transactions (clinic_id, created_at desc);
create index if not exists idx_credit_tx_reference
  on credit_transactions (reference_id);

alter table credit_transactions enable row level security;
alter table credit_transactions force row level security;
-- Read-only to the clinic; all writes go through the definer functions.
drop policy if exists credit_tx_select on credit_transactions;
create policy credit_tx_select on credit_transactions for select to authenticated
  using (clinic_id = current_clinic_id());
-- No insert/update/delete policies → authenticated cannot write the ledger.

-- ------------------------------------------------------------
-- 2. reserve_credits — atomic spend BEFORE the paid call
-- ------------------------------------------------------------
-- Returns the clinic's remaining credits after reserving, or NULL if there
-- aren't enough (no row updated → nothing charged, no ledger row). The
-- caller treats NULL as "insufficient credits" and never proceeds to the
-- paid call. p_reference is a per-operation uuid the caller also passes to
-- refund_credits if the paid call then fails.
create or replace function reserve_credits(
  p_cost      integer,
  p_reason    text,
  p_reference uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic    uuid;
  v_remaining integer;
begin
  if p_cost is null or p_cost <= 0 then
    raise exception 'invalid credit cost';
  end if;
  if p_reference is null then
    raise exception 'reference required';
  end if;

  v_clinic := current_clinic_id();
  if v_clinic is null then
    raise exception 'no clinic for current user';
  end if;

  -- Atomic: the row lock + the balance predicate mean two concurrent
  -- reservations can never both pass. No row back = not enough credits.
  update clinics
     set credits_used = credits_used + p_cost
   where id = v_clinic
     and credits_used + p_cost <= monthly_credits
  returning monthly_credits - credits_used into v_remaining;

  if not found then
    return null;                         -- insufficient; nothing reserved
  end if;

  insert into credit_transactions (clinic_id, user_id, amount, kind, reason, reference_id)
  values (v_clinic, auth.uid(), -p_cost, 'reserve', p_reason, p_reference);

  return v_remaining;
end;
$$;

revoke execute on function reserve_credits(integer, text, uuid) from public, anon;
grant  execute on function reserve_credits(integer, text, uuid) to authenticated;

-- ------------------------------------------------------------
-- 3. refund_credits — give back a reservation whose paid call failed
-- ------------------------------------------------------------
-- Only ever refunds against a matching, not-yet-refunded reserve in the
-- caller's clinic, and only up to the amount originally reserved. This
-- closes the obvious abuse: a user cannot call refund to inflate their
-- balance, because there is nothing to refund without a real prior
-- reserve, and each reserve can be refunded at most once. Returns the new
-- remaining credits, or NULL if there was nothing to refund (no-op).
create or replace function refund_credits(
  p_reference uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic    uuid;
  v_cost      integer;
  v_remaining integer;
begin
  v_clinic := current_clinic_id();
  if v_clinic is null then
    raise exception 'no clinic for current user';
  end if;

  -- The reserve for this reference, in THIS clinic (amount is negative).
  select -amount into v_cost
    from credit_transactions
   where clinic_id = v_clinic
     and reference_id = p_reference
     and kind = 'reserve'
   limit 1;
  if v_cost is null then
    return null;                         -- no such reservation → no-op
  end if;

  -- Already refunded? Don't double-credit.
  if exists (
    select 1 from credit_transactions
     where reference_id = p_reference and kind = 'refund'
  ) then
    return null;
  end if;

  update clinics
     set credits_used = greatest(credits_used - v_cost, 0)
   where id = v_clinic
  returning monthly_credits - credits_used into v_remaining;

  insert into credit_transactions (clinic_id, user_id, amount, kind, reason, reference_id)
  values (v_clinic, auth.uid(), v_cost, 'refund', 'refund', p_reference);

  return v_remaining;
end;
$$;

revoke execute on function refund_credits(uuid) from public, anon;
grant  execute on function refund_credits(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. SERP reservation — status column so in-flight/failed rows
--    don't pollute the UI, and a crash fails CLOSED (still counts).
-- ------------------------------------------------------------
alter table rank_scans      add column if not exists status text not null default 'complete';
alter table prospect_audits add column if not exists status text not null default 'complete';
-- Existing rows stay 'complete'. New flow: 'reserved' → 'complete' (finalize)
-- or the row is deleted (total failure). Budget counts reserved + complete
-- (a reserved row consumes quota up front); the UI shows only 'complete'.

-- ---- reserve_rank_scan (clinic-scoped) ----
-- p_cap is the monthly scan cap (from env, computed app-side). Serializes
-- per clinic so the count reflects committed reservations, then inserts a
-- 'reserved' row and returns its id. Raises if the keyword isn't the
-- caller's or the cap is already reached.
create or replace function reserve_rank_scan(
  p_keyword_id uuid,
  p_cap        integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic      uuid;
  v_used        integer;
  v_month_start timestamptz := (date_trunc('month', (now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata');
  v_id          uuid;
begin
  v_clinic := current_clinic_id();
  if v_clinic is null then
    raise exception 'no clinic for current user';
  end if;
  if not exists (
    select 1 from rank_tracking_keywords
     where id = p_keyword_id and clinic_id = v_clinic
  ) then
    raise exception 'keyword not in this clinic';
  end if;

  -- Serialize scan reservations for this clinic so the count below sees
  -- every already-committed reservation (closes the count race).
  perform pg_advisory_xact_lock(hashtext('rank_scan'), hashtext(v_clinic::text));

  select count(*) into v_used
    from rank_scans
   where clinic_id = v_clinic
     and created_at >= v_month_start;

  if p_cap is not null and v_used >= p_cap then
    raise exception 'scan cap reached' using errcode = 'P0001';
  end if;

  insert into rank_scans (clinic_id, keyword_id, requests_made, created_by, status)
  values (v_clinic, p_keyword_id, 0, auth.uid(), 'reserved')
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function reserve_rank_scan(uuid, integer) from public, anon;
grant  execute on function reserve_rank_scan(uuid, integer) to authenticated;

-- ---- reserve_prospect_audit (AGENCY-scoped) ----
-- Prospecting is agency-scoped (created_by = auth.uid() AND is_agency()),
-- not clinic-scoped. Same reserve-then-count pattern, keyed on the user.
create or replace function reserve_prospect_audit(
  p_cap integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_used        integer;
  v_month_start timestamptz := (date_trunc('month', (now() at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata');
  v_id          uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not is_agency() then
    raise exception 'prospecting is agency-only';
  end if;

  perform pg_advisory_xact_lock(hashtext('prospect_audit'), hashtext(v_uid::text));

  select count(*) into v_used
    from prospect_audits
   where created_by = v_uid
     and created_at >= v_month_start;

  if p_cap is not null and v_used >= p_cap then
    raise exception 'audit cap reached' using errcode = 'P0001';
  end if;

  insert into prospect_audits (created_by, requests_made, status)
  values (v_uid, 0, 'reserved')
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function reserve_prospect_audit(integer) from public, anon;
grant  execute on function reserve_prospect_audit(integer) to authenticated;
