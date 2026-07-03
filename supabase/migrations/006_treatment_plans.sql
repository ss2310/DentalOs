-- 006_treatment_plans.sql
-- Treatment Plan Presenter: named, multi-line treatment plans a clinic can
-- build for a patient and send over WhatsApp. Clinic-scoped like everything
-- else. `items` holds the line items as jsonb: [{ "name": text, "cost": number }].
--
-- Idempotent: safe to re-run. Requires 001_init.sql.

create table if not exists treatment_plans (
  id               uuid primary key default gen_random_uuid(),
  clinic_id        uuid not null references clinics (id) on delete restrict,
  patient_id       uuid not null references patients (id) on delete restrict,
  plan_name        text not null,
  items            jsonb not null default '[]'::jsonb,
  total_cost       numeric(12,2) not null default 0,
  sent_to_patient  boolean not null default false,
  created_at       timestamptz not null default now()
);

create index if not exists idx_treatment_plans_patient
  on treatment_plans (clinic_id, patient_id);

-- ---- RLS: clinic-scoped, same shape as rate_cards ----
alter table treatment_plans enable row level security;
alter table treatment_plans force row level security;

drop policy if exists treatment_plans_select on treatment_plans;
create policy treatment_plans_select on treatment_plans for select to authenticated
  using (clinic_id = current_clinic_id());

drop policy if exists treatment_plans_insert on treatment_plans;
create policy treatment_plans_insert on treatment_plans for insert to authenticated
  with check (clinic_id = current_clinic_id());

drop policy if exists treatment_plans_update on treatment_plans;
create policy treatment_plans_update on treatment_plans for update to authenticated
  using (clinic_id = current_clinic_id())
  with check (clinic_id = current_clinic_id());

drop policy if exists treatment_plans_delete on treatment_plans;
create policy treatment_plans_delete on treatment_plans for delete to authenticated
  using (clinic_id = current_clinic_id());
