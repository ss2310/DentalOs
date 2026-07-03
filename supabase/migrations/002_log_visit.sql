-- ============================================================
-- GrowthOS — log_visit()
-- The core "save visit" workflow, run as ONE transaction so a partial
-- failure can never corrupt data (orphaned outstandings, double-counted
-- revenue, etc.).
--
-- SECURITY DEFINER: bypasses RLS internally, so it re-derives clinic_id
-- from current_clinic_id() and stamps every inserted row with it — it
-- never trusts a clinic_id from the client, and verifies the appointment
-- and rate card belong to that clinic before writing anything.
--
-- Idempotent (create or replace) — safe to re-run in the SQL Editor.
-- ============================================================

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

  -- Step 6: (removed) the post-visit review reminder is no longer created
  -- here. The morning briefing's check (b) groups "review requests pending"
  -- for appointments completed 2-7 days ago (see 004_notifications.sql), so
  -- an immediate per-visit notification would double up.

  return v_patient;
end;
$$;

revoke execute on function
  log_visit(uuid, uuid, text, numeric, numeric, text) from public, anon;
grant execute on function
  log_visit(uuid, uuid, text, numeric, numeric, text) to authenticated;
