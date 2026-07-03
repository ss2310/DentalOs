-- seed_demo.sql — realistic demo data for ONE clinic, looked up by owner email.
--
-- HOW TO RUN
--   1. Edit the v_email line below to the email you signed up with.
--   2. Supabase Dashboard → SQL Editor → paste this whole file → Run.
--   3. Run ONCE. Re-running duplicates the demo rows (there is no clean-up).
--
-- Requires 001–006 applied, plus 005 (post_types) if you want the demo
-- generated-content rows (they're skipped automatically if post_types is empty).
-- Rate cards are the ones seeded for your clinic at signup.

do $$
declare
  v_email  text := 'utsavgoyal1981@gmail.com';   -- <<< CHANGE THIS to your login email
  v_clinic uuid;
  v_user   uuid;
  v_doctor text;
  v_today  date := (now() at time zone 'Asia/Kolkata')::date;

  -- rate cards (seeded at signup; nulls are fine — the FKs are nullable)
  rc_consult  uuid; rc_scaling uuid; rc_rct     uuid; rc_whiten uuid;
  rc_filling  uuid; rc_crown   uuid; rc_extract uuid; rc_implant uuid;

  -- patients
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5 uuid;
  p6 uuid; p7 uuid; p8 uuid; p9 uuid; p10 uuid;

  -- appointments / visits we cross-reference
  a1 uuid; a2 uuid;
  v1 uuid; v2 uuid; v3 uuid; v4 uuid;

  -- pipeline case (whitening accepted — linked from a recovery event)
  c_whiten uuid;

  -- post types (optional demo content)
  pt_gbp uuid; pt_ig uuid; pt_blog uuid;
begin
  -- ---- resolve the clinic from the owner's email --------------------------
  select u.id, p.home_clinic_id
    into v_user, v_clinic
  from auth.users u
  join profiles p on p.id = u.id
  where lower(u.email) = lower(v_email);

  if v_clinic is null then
    raise exception 'No clinic found for %. Check the email and that you have signed up.', v_email;
  end if;

  select doctor_name into v_doctor from clinics where id = v_clinic;
  v_doctor := coalesce(v_doctor, 'the dentist');

  -- ---- rate card lookups --------------------------------------------------
  select id into rc_consult from rate_cards where clinic_id = v_clinic and treatment_name = 'Consultation' limit 1;
  select id into rc_scaling from rate_cards where clinic_id = v_clinic and treatment_name = 'Scaling & Polishing' limit 1;
  select id into rc_rct     from rate_cards where clinic_id = v_clinic and treatment_name = 'RCT Single Sitting' limit 1;
  select id into rc_whiten  from rate_cards where clinic_id = v_clinic and treatment_name = 'Teeth Whitening' limit 1;
  select id into rc_filling from rate_cards where clinic_id = v_clinic and treatment_name = 'Composite Filling' limit 1;
  select id into rc_crown   from rate_cards where clinic_id = v_clinic and treatment_name = 'Crown Zirconia' limit 1;
  select id into rc_extract from rate_cards where clinic_id = v_clinic and treatment_name = 'Tooth Extraction' limit 1;
  select id into rc_implant from rate_cards where clinic_id = v_clinic and treatment_name = 'Dental Implant' limit 1;

  -- ---- 10 patients (Kota) — p2 has a birthday in 2 days --------------------
  insert into patients (clinic_id, full_name, whatsapp_number, phone, date_of_birth, gender, area, notes)
    values (v_clinic, 'Rajesh Sharma',  '9829011001', '9829011001', (v_today - interval '42 years')::date,        'Male',   'Vigyan Nagar', 'DEMO') returning id into p1;
  insert into patients (clinic_id, full_name, whatsapp_number, phone, date_of_birth, gender, area, notes)
    values (v_clinic, 'Priya Meena',    '9829011002', '9829011002', ((v_today + 2) - interval '30 years')::date,  'Female', 'Talwandi',     'DEMO — birthday this week') returning id into p2;
  insert into patients (clinic_id, full_name, whatsapp_number, phone, date_of_birth, gender, area, notes)
    values (v_clinic, 'Amit Gupta',     '9829011003', '9829011003', (v_today - interval '55 years')::date,        'Male',   'Mahaveer Nagar','DEMO') returning id into p3;
  insert into patients (clinic_id, full_name, whatsapp_number, phone, date_of_birth, gender, area, notes)
    values (v_clinic, 'Sunita Verma',   '9829011004', '9829011004', (v_today - interval '38 years')::date,        'Female', 'Dadabari',     'DEMO') returning id into p4;
  insert into patients (clinic_id, full_name, whatsapp_number, phone, date_of_birth, gender, area, notes)
    values (v_clinic, 'Vikram Singh',   '9829011005', '9829011005', (v_today - interval '27 years')::date,        'Male',   'Rangbari',     'DEMO') returning id into p5;
  insert into patients (clinic_id, full_name, whatsapp_number, phone, date_of_birth, gender, area, notes)
    values (v_clinic, 'Neha Agarwal',   '9829011006', '9829011006', (v_today - interval '33 years')::date,        'Female', 'Gumanpura',    'DEMO') returning id into p6;
  insert into patients (clinic_id, full_name, whatsapp_number, phone, date_of_birth, gender, area, notes)
    values (v_clinic, 'Manish Jain',    '9829011007', '9829011007', (v_today - interval '49 years')::date,        'Male',   'Borkhera',     'DEMO') returning id into p7;
  insert into patients (clinic_id, full_name, whatsapp_number, phone, date_of_birth, gender, area, notes)
    values (v_clinic, 'Pooja Rathore',  '9829011008', '9829011008', (v_today - interval '22 years')::date,        'Female', 'Kunhari',      'DEMO') returning id into p8;
  insert into patients (clinic_id, full_name, whatsapp_number, phone, date_of_birth, gender, area, notes)
    values (v_clinic, 'Deepak Nagar',   '9829011009', '9829011009', (v_today - interval '61 years')::date,        'Male',   'Srinathpuram', 'DEMO') returning id into p9;
  insert into patients (clinic_id, full_name, whatsapp_number, phone, date_of_birth, gender, area, notes)
    values (v_clinic, 'Kavita Soni',    '9829011010', '9829011010', (v_today - interval '35 years')::date,        'Female', 'Vallabh Nagar','DEMO') returning id into p10;

  -- ---- 8 appointments today + 1 tomorrow ----------------------------------
  -- two completed (get visit logs)
  insert into appointments (clinic_id, patient_id, appointment_date, appointment_time, treatment_type_id, doctor, status)
    values (v_clinic, p1, v_today, '09:30', rc_scaling, v_doctor, 'completed') returning id into a1;
  insert into appointments (clinic_id, patient_id, appointment_date, appointment_time, treatment_type_id, doctor, status)
    values (v_clinic, p2, v_today, '10:00', rc_rct,     v_doctor, 'completed') returning id into a2;
  -- two confirmed
  insert into appointments (clinic_id, patient_id, appointment_date, appointment_time, treatment_type_id, doctor, status)
    values (v_clinic, p3, v_today, '10:30', rc_consult, v_doctor, 'confirmed');
  insert into appointments (clinic_id, patient_id, appointment_date, appointment_time, treatment_type_id, doctor, status)
    values (v_clinic, p4, v_today, '11:00', rc_whiten,  v_doctor, 'confirmed');
  -- one arrived, one in_chair
  insert into appointments (clinic_id, patient_id, appointment_date, appointment_time, treatment_type_id, doctor, status)
    values (v_clinic, p5, v_today, '11:30', rc_filling, v_doctor, 'arrived');
  insert into appointments (clinic_id, patient_id, appointment_date, appointment_time, treatment_type_id, doctor, status)
    values (v_clinic, p6, v_today, '12:00', rc_crown,   v_doctor, 'in_chair');
  -- one no-show (recovery not yet sent), one scheduled
  insert into appointments (clinic_id, patient_id, appointment_date, appointment_time, treatment_type_id, doctor, status, recovery_sent_at)
    values (v_clinic, p7, v_today, '12:30', rc_extract, v_doctor, 'no_show', null);
  insert into appointments (clinic_id, patient_id, appointment_date, appointment_time, treatment_type_id, doctor, status)
    values (v_clinic, p8, v_today, '13:00', rc_consult, v_doctor, 'scheduled');
  -- tomorrow (no 24h reminder yet → shows in the morning briefing / dashboard)
  insert into appointments (clinic_id, patient_id, appointment_date, appointment_time, treatment_type_id, doctor, status, reminder_24h_sent_at)
    values (v_clinic, p9, v_today + 1, '10:00', rc_scaling, v_doctor, 'scheduled', null);

  -- ---- visit logs ---------------------------------------------------------
  -- v1: paid in full (no balance)
  insert into visit_logs (clinic_id, patient_id, appointment_id, visit_date, treatment_id, treatment_name_text, treatment_category, doctor, cost, amount_paid, outstanding_amount, payment_status, created_by)
    values (v_clinic, p1, a1, v_today, rc_scaling, 'Scaling & Polishing', 'Preventive', v_doctor, 1500, 1500, 0, 'paid', v_user) returning id into v1;
  -- v2: partial → ₹2,000 fresh outstanding
  insert into visit_logs (clinic_id, patient_id, appointment_id, visit_date, treatment_id, treatment_name_text, treatment_category, doctor, cost, amount_paid, outstanding_amount, payment_status, created_by)
    values (v_clinic, p2, a2, v_today, rc_rct, 'RCT Single Sitting', 'Endodontics', v_doctor, 4500, 2500, 2000, 'partial', v_user) returning id into v2;
  -- v3: 18 days ago → ₹5,500 outstanding (still "current" bucket)
  insert into visit_logs (clinic_id, patient_id, visit_date, treatment_id, treatment_name_text, treatment_category, doctor, cost, amount_paid, outstanding_amount, payment_status, created_by)
    values (v_clinic, p3, v_today - 18, rc_crown, 'Crown Zirconia', 'Prosthodontics', v_doctor, 9000, 3500, 5500, 'partial', v_user) returning id into v3;
  -- v4: 35 days ago → ₹1,200 outstanding (days_30 bucket)
  insert into visit_logs (clinic_id, patient_id, visit_date, treatment_id, treatment_name_text, treatment_category, doctor, cost, amount_paid, outstanding_amount, payment_status, created_by)
    values (v_clinic, p4, v_today - 35, rc_filling, 'Composite Filling', 'Restorative', v_doctor, 1200, 0, 1200, 'pending', v_user) returning id into v4;

  -- ---- 3 outstandings -----------------------------------------------------
  insert into outstandings (clinic_id, patient_id, visit_log_id, total_amount, amount_paid, nett_due, age_bucket)
    values (v_clinic, p2, v2, 4500, 2500, 2000, 'current');
  insert into outstandings (clinic_id, patient_id, visit_log_id, total_amount, amount_paid, nett_due, age_bucket)
    values (v_clinic, p3, v3, 9000, 3500, 5500, 'current');
  insert into outstandings (clinic_id, patient_id, visit_log_id, total_amount, amount_paid, nett_due, age_bucket)
    values (v_clinic, p4, v4, 1200, 0, 1200, 'days_30');

  -- patient rollups so the detail pages / stats look real
  update patients set total_visits = 1, lifetime_revenue = 1500, total_outstanding = 0,    last_visit_date = v_today       where id = p1;
  update patients set total_visits = 1, lifetime_revenue = 2500, total_outstanding = 2000, last_visit_date = v_today       where id = p2;
  update patients set total_visits = 1, lifetime_revenue = 3500, total_outstanding = 5500, last_visit_date = v_today - 18  where id = p3;
  update patients set total_visits = 1, lifetime_revenue = 0,    total_outstanding = 1200, last_visit_date = v_today - 35  where id = p4;

  -- ---- 4 pipeline cases ---------------------------------------------------
  insert into case_pipeline (clinic_id, patient_id, treatment_id, plan_value, stage, presented_date, follow_up_date)
    values (v_clinic, p5, rc_implant, 45000, 'thinking', v_today - 5, v_today);            -- follow-up due today
  insert into case_pipeline (clinic_id, patient_id, treatment_id, plan_value, stage, presented_date)
    values (v_clinic, p6, null,       35000, 'presented', v_today - 2);                    -- Braces (no rate card)
  insert into case_pipeline (clinic_id, patient_id, treatment_id, plan_value, stage, presented_date, accepted_date)
    values (v_clinic, p7, rc_whiten,  12000, 'accepted', v_today - 3, v_today - 1) returning id into c_whiten;
  insert into case_pipeline (clinic_id, patient_id, treatment_id, plan_value, stage)
    values (v_clinic, p8, rc_rct,     15000, 'identified');                                -- RCT + Crown

  -- ---- 4 recalls (2 overdue, 1 today, 1 in 3 days) ------------------------
  insert into recalls (clinic_id, patient_id, source_treatment_id, recall_type, due_date, status)
    values (v_clinic, p1, rc_scaling, 'general_checkup', v_today - 10, 'pending');
  insert into recalls (clinic_id, patient_id, source_treatment_id, recall_type, due_date, status)
    values (v_clinic, p9, rc_consult, 'general_checkup', v_today - 3,  'pending');
  insert into recalls (clinic_id, patient_id, source_treatment_id, recall_type, due_date, status)
    values (v_clinic, p4, rc_filling, 'general_checkup', v_today,      'pending');
  insert into recalls (clinic_id, patient_id, source_treatment_id, recall_type, due_date, status)
    values (v_clinic, p10, rc_scaling,'general_checkup', v_today + 3,  'pending');

  -- ---- 5 recovery events with outcomes (this month) ----------------------
  -- Four positive (one per breakdown card) + one lost.
  insert into recovery_events (clinic_id, patient_id, recovery_type, trigger_date, action_taken_date, wa_message_sent, outcome, outcome_date, revenue_recovered)
    values (v_clinic, p7, 'no_show',             v_today - 6, v_today - 5, true, 'rebooked', v_today, 4500);
  insert into recovery_events (clinic_id, patient_id, recovery_type, original_case_id, trigger_date, action_taken_date, wa_message_sent, outcome, outcome_date, revenue_recovered)
    values (v_clinic, p7, 'deferred_treatment',  c_whiten, v_today - 4, v_today - 2, true, 'accepted', v_today, 12000);
  insert into recovery_events (clinic_id, patient_id, recovery_type, trigger_date, action_taken_date, wa_message_sent, outcome, outcome_date, revenue_recovered)
    values (v_clinic, p1, 'recall_overdue',       v_today - 7, v_today - 3, true, 'returned', v_today, 1500);
  insert into recovery_events (clinic_id, patient_id, recovery_type, trigger_date, action_taken_date, wa_message_sent, outcome, outcome_date, revenue_recovered)
    values (v_clinic, p3, 'outstanding_payment',  v_today - 5, v_today - 1, true, 'paid', v_today, 5500);
  insert into recovery_events (clinic_id, patient_id, recovery_type, trigger_date, action_taken_date, wa_message_sent, outcome, outcome_date, revenue_recovered)
    values (v_clinic, p9, 'cancelled',            v_today - 8, v_today - 6, true, 'lost', v_today, 0);

  -- ---- 5 generated_content rows (skipped if post_types not seeded) --------
  select id into pt_gbp  from post_types where name = 'GBP Post' limit 1;
  select id into pt_ig   from post_types where name = 'Instagram Caption' limit 1;
  select id into pt_blog from post_types where name = 'Blog Article' limit 1;

  if pt_gbp is not null and pt_ig is not null and pt_blog is not null then
    insert into generated_content (clinic_id, post_type_id, topic, tone_used, generated_copy, status, credits_deducted, published_date)
      values (v_clinic, pt_gbp, 'Painless single-sitting root canal', 'Friendly',
        'Daant ka dard? Single sitting RCT se aaram, wahi din ghar. Book karein aaj hi 🦷', 'published', 2, v_today - 5);
    insert into generated_content (clinic_id, post_type_id, topic, tone_used, generated_copy, status, credits_deducted, published_date)
      values (v_clinic, pt_ig, 'Teeth whitening this wedding season', 'Warm',
        'Shaadi season aa gaya — bright smile ke liye professional whitening. DM for slots ✨', 'published', 1, v_today - 2);
    insert into generated_content (clinic_id, post_type_id, topic, tone_used, generated_copy, status, credits_deducted)
      values (v_clinic, pt_gbp, 'Free dental checkup camp', 'Professional',
        'Is weekend free dental checkup camp. Pehle aao, pehle pao. Details ke liye call karein.', 'draft', 2);
    insert into generated_content (clinic_id, post_type_id, topic, tone_used, generated_copy, status, credits_deducted)
      values (v_clinic, pt_blog, 'Is teeth scaling safe? Myths vs facts', 'Professional',
        'META TITLE: Is Teeth Scaling Safe? | Kota\nScaling removes tartar brushing cannot...', 'draft', 3);
    insert into generated_content (clinic_id, post_type_id, topic, tone_used, generated_copy, status, credits_deducted)
      values (v_clinic, pt_ig, 'Kids first dental visit tips', 'Friendly',
        'Bacche ka pehla dental visit? 3 simple tips taaki woh smile ke saath jaaye 😊', 'scheduled', 1);
  else
    raise notice 'post_types not seeded (run 005) — skipped the 5 generated_content rows.';
  end if;

  raise notice 'Demo data seeded for clinic % (%).', v_clinic, v_email;
end;
$$;
