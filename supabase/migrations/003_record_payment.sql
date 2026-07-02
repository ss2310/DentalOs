-- ============================================================
-- GrowthOS — record_payment()
-- Records a payment against an outstanding balance in ONE transaction,
-- so the outstanding, patient rollups, and recovery_event can never
-- drift out of sync on a partial failure.
--
-- SECURITY DEFINER: re-derives clinic_id from current_clinic_id() and
-- verifies the outstanding belongs to that clinic before writing.
-- Idempotent (create or replace).
-- ============================================================

create or replace function record_payment(
  p_outstanding_id uuid,
  p_amount         numeric,
  p_payment_mode   text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic   uuid;
  v_o        outstandings%rowtype;
  v_new_paid numeric(10,2);
  v_new_due  numeric(10,2);
  v_today    date := timezone('Asia/Kolkata', now())::date;
begin
  -- p_payment_mode is captured from the UI for a future payments ledger.
  -- TODO: persist it once a payments table exists (no column for it today).

  v_clinic := current_clinic_id();
  if v_clinic is null then
    raise exception 'no clinic for current user';
  end if;

  select * into v_o from outstandings where id = p_outstanding_id;
  if v_o.id is null then
    raise exception 'outstanding not found';
  end if;
  if v_o.clinic_id <> v_clinic then
    raise exception 'outstanding belongs to another clinic';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid amount';
  end if;
  if p_amount > v_o.nett_due then
    raise exception 'amount exceeds balance due';
  end if;

  v_new_paid := v_o.amount_paid + p_amount;
  v_new_due  := greatest(v_o.nett_due - p_amount, 0);

  -- 1. Outstanding.
  update outstandings
     set amount_paid = v_new_paid,
         nett_due    = v_new_due
   where id = p_outstanding_id;

  -- 2. Patient rollups.
  update patients
     set total_outstanding = greatest(total_outstanding - p_amount, 0),
         lifetime_revenue  = lifetime_revenue + p_amount
   where id = v_o.patient_id;

  -- 3. If cleared, close out the linked recovery_event.
  if v_new_due = 0 then
    update recovery_events
       set outcome           = 'paid',
           outcome_date      = v_today,
           revenue_recovered = v_new_paid
     where original_outstanding_id = p_outstanding_id;
  end if;

  return v_new_due;
end;
$$;

revoke execute on function
  record_payment(uuid, numeric, text) from public, anon;
grant execute on function
  record_payment(uuid, numeric, text) to authenticated;
