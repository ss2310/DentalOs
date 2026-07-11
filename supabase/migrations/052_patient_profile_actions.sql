-- ============================================================
-- GrowthOS — migration 052: patient profile as a cockpit
--
-- 1. PAYMENTS LEDGER — the table 003_record_payment.sql left as a TODO.
--    Every rupee received is now a row: visit-time collections (log_visit)
--    and later recoveries (record_payment) both write here, so the patient
--    profile can show a true payment history with date + mode.
-- 2. record_payment() replaced — same behavior, now persists the payment
--    (amount, mode) into the ledger.
-- 3. log_visit() replaced — same behavior, now writes a ledger row for the
--    amount collected at the visit (when > 0).
-- 4. log_walk_in_visit() NEW — "add today's treatment" straight from the
--    patient profile. Creates a synthetic same-day completed appointment,
--    then runs the existing log_visit() on it, so every invariant
--    (one-visit-per-appointment, outstandings, recovery events, rollups,
--    recalls) is preserved with zero forked logic.
-- 5. treatment_plans.updated_at — stamped when a plan is edited from the
--    profile (plans were create-only before).
--
-- Additive + idempotent. Requires 001 (core), 002 (log_visit),
-- 003 (record_payment), 006 (treatment_plans).
-- Run in the Supabase SQL editor, then: notify pgrst, 'reload schema';
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. payments — the money ledger. One row per rupee-event, append-only.
-- ---------------------------------------------------------------------------
create table if not exists payments (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references clinics (id) on delete cascade,
  patient_id     uuid not null references patients (id) on delete cascade,
  visit_log_id   uuid references visit_logs (id) on delete set null,
  outstanding_id uuid references outstandings (id) on delete set null,
  amount         numeric(10,2) not null check (amount > 0),
  payment_mode   payment_mode not null,
  payment_date   date not null default (timezone('Asia/Kolkata', now())::date),
  created_by     uuid,
  created_at     timestamptz not null default now()
);

create index if not exists payments_clinic_patient_idx
  on payments (clinic_id, patient_id, payment_date desc);

alter table payments enable row level security;

-- Standard clinic-scoped policies (same pattern as 001_init.sql). The ledger
-- is append-only for clinic users: select + insert, no update/delete.
drop policy if exists payments_select on payments;
create policy payments_select on payments for select to authenticated
  using (clinic_id = current_clinic_id());

drop policy if exists payments_insert on payments;
create policy payments_insert on payments for insert to authenticated
  with check (clinic_id = current_clinic_id());

-- ---------------------------------------------------------------------------
-- 2. record_payment() — unchanged behavior + ledger row (persists the mode
--    that 003 accepted but dropped).
-- ---------------------------------------------------------------------------
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

  -- 4. Ledger row (new in 052) — the payment finally has a home of its own.
  insert into payments (
    clinic_id, patient_id, visit_log_id, outstanding_id,
    amount, payment_mode, payment_date, created_by
  ) values (
    v_clinic, v_o.patient_id, v_o.visit_log_id, p_outstanding_id,
    p_amount, p_payment_mode::payment_mode, v_today, auth.uid()
  );

  return v_new_due;
end;
$$;

revoke execute on function
  record_payment(uuid, numeric, text) from public, anon;
grant execute on function
  record_payment(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. log_visit() — unchanged behavior + ledger row for money collected at
--    the chair (when p_amount_paid > 0).
-- ---------------------------------------------------------------------------
create or replace function log_visit(
  p_appointment_id uuid,
  p_treatment_id   uuid,
  p_doctor         text,
  p_cost           numeric,
  p_amount_paid    numeric,
  p_payment_mode   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic         uuid;
  v_patient        uuid;
  v_appt_clinic    uuid;
  v_rate           rate_cards%rowtype;
  v_today          date := timezone('Asia/Kolkata', now())::date;
  v_outstanding    numeric(10,2);
  v_status         payment_status;
  v_visit_id       uuid;
  v_outstanding_id uuid;
  v_patient_name   text;
begin
  v_clinic := current_clinic_id();
  if v_clinic is null then
    raise exception 'no clinic for current user';
  end if;

  -- Appointment must exist and belong to this clinic.
  select patient_id, clinic_id into v_patient, v_appt_clinic
  from appointments where id = p_appointment_id;
  if v_patient is null then
    raise exception 'appointment not found';
  end if;
  if v_appt_clinic <> v_clinic then
    raise exception 'appointment belongs to another clinic';
  end if;

  -- One visit_log per appointment (prevents double-counting revenue).
  if exists (select 1 from visit_logs where appointment_id = p_appointment_id) then
    raise exception 'visit already logged for this appointment';
  end if;

  -- Rate card must exist and belong to this clinic.
  select * into v_rate from rate_cards where id = p_treatment_id;
  if v_rate.id is null then
    raise exception 'treatment not found';
  end if;
  if v_rate.clinic_id <> v_clinic then
    raise exception 'treatment belongs to another clinic';
  end if;

  -- Money validation (mirrors the client, enforced server-side).
  if p_cost is null or p_cost < 0 then
    raise exception 'invalid cost';
  end if;
  if p_amount_paid is null or p_amount_paid < 0 then
    raise exception 'invalid amount paid';
  end if;
  if p_amount_paid > p_cost then
    raise exception 'amount paid cannot exceed cost';
  end if;

  v_outstanding := p_cost - p_amount_paid;
  v_status := case
    when p_amount_paid >= p_cost then 'paid'
    when p_amount_paid > 0        then 'partial'
    else 'pending'
  end;

  -- Step 1: visit_log (treatment name/category snapshotted from the card).
  insert into visit_logs (
    clinic_id, patient_id, appointment_id, visit_date, treatment_id,
    treatment_name_text, treatment_category, doctor, cost, amount_paid,
    outstanding_amount, payment_mode, payment_status, created_by
  ) values (
    v_clinic, v_patient, p_appointment_id, v_today, p_treatment_id,
    v_rate.treatment_name, v_rate.category, p_doctor, p_cost, p_amount_paid,
    v_outstanding, p_payment_mode::payment_mode, v_status, auth.uid()
  )
  returning id into v_visit_id;

  -- Steps 2 & 3: only when money is still due.
  if v_outstanding > 0 then
    insert into outstandings (
      clinic_id, patient_id, visit_log_id, total_amount, amount_paid,
      nett_due, age_bucket
    ) values (
      v_clinic, v_patient, v_visit_id, p_cost, p_amount_paid,
      v_outstanding, 'current'
    )
    returning id into v_outstanding_id;

    insert into recovery_events (
      clinic_id, patient_id, recovery_type, original_outstanding_id, trigger_date
    ) values (
      v_clinic, v_patient, 'outstanding_payment', v_outstanding_id, v_today
    );
  end if;

  -- Step 4: patient rollups.
  update patients set
    total_visits      = total_visits + 1,
    lifetime_revenue  = lifetime_revenue + p_amount_paid,
    total_outstanding = total_outstanding + v_outstanding,
    last_visit_date   = v_today
  where id = v_patient
  returning full_name into v_patient_name;

  -- Step 5: recall, only if the treatment defines a recall interval.
  if v_rate.recall_interval_days is not null and v_rate.recall_interval_days > 0 then
    insert into recalls (
      clinic_id, patient_id, source_visit_id, source_treatment_id,
      recall_type, due_date, status
    ) values (
      v_clinic, v_patient, v_visit_id, p_treatment_id,
      'general_checkup', v_today + v_rate.recall_interval_days, 'pending'
    );
  end if;

  -- Step 6: ledger row for the amount collected at the visit (new in 052).
  if p_amount_paid > 0 then
    insert into payments (
      clinic_id, patient_id, visit_log_id, outstanding_id,
      amount, payment_mode, payment_date, created_by
    ) values (
      v_clinic, v_patient, v_visit_id, v_outstanding_id,
      p_amount_paid, p_payment_mode::payment_mode, v_today, auth.uid()
    );
  end if;

  return v_patient;
end;
$$;

revoke execute on function
  log_visit(uuid, uuid, text, numeric, numeric, text) from public, anon;
grant execute on function
  log_visit(uuid, uuid, text, numeric, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. log_walk_in_visit() — "add today's treatment" from the patient profile.
--    Creates a synthetic completed appointment for today, then delegates to
--    log_visit() so every existing invariant and side-effect applies.
-- ---------------------------------------------------------------------------
create or replace function log_walk_in_visit(
  p_patient_id   uuid,
  p_treatment_id uuid,
  p_doctor       text,
  p_cost         numeric,
  p_amount_paid  numeric,
  p_payment_mode text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic  uuid;
  v_pt      uuid;
  v_today   date := timezone('Asia/Kolkata', now())::date;
  v_now     time := timezone('Asia/Kolkata', now())::time;
  v_appt_id uuid;
begin
  v_clinic := current_clinic_id();
  if v_clinic is null then
    raise exception 'no clinic for current user';
  end if;

  -- Patient must exist and belong to this clinic.
  select id into v_pt from patients
   where id = p_patient_id and clinic_id = v_clinic;
  if v_pt is null then
    raise exception 'patient not found';
  end if;

  -- Synthetic same-day appointment, already completed (walk-in).
  insert into appointments (
    clinic_id, patient_id, appointment_date, appointment_time,
    treatment_type_id, doctor, status, notes
  ) values (
    v_clinic, p_patient_id, v_today, v_now,
    p_treatment_id, p_doctor, 'completed', 'Walk-in — logged from patient profile'
  )
  returning id into v_appt_id;

  -- Delegate: validation, visit_log, outstanding, recovery, rollups, recall,
  -- payment ledger — all the existing rails. Same transaction, so if
  -- log_visit raises, the synthetic appointment rolls back with it.
  perform log_visit(
    v_appt_id, p_treatment_id, p_doctor, p_cost, p_amount_paid, p_payment_mode
  );

  return v_appt_id;
end;
$$;

revoke execute on function
  log_walk_in_visit(uuid, uuid, text, numeric, numeric, text) from public, anon;
grant execute on function
  log_walk_in_visit(uuid, uuid, text, numeric, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. treatment_plans.updated_at — plans become editable from the profile.
-- ---------------------------------------------------------------------------
alter table treatment_plans add column if not exists updated_at timestamptz;

-- ---------------------------------------------------------------------------
-- 6. Register this migration.
-- ---------------------------------------------------------------------------
insert into applied_migrations (version, name) values
  ('052','patient_profile_actions')
on conflict (version) do nothing;
