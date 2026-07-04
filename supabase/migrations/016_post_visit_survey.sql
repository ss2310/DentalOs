-- 016_post_visit_survey.sql
-- Post-visit satisfaction survey wiring.
--
-- The survey_responses table, the survey_route enum, and the two token-scoped
-- anon functions (get_survey_by_token / submit_survey_response) already exist
-- from 001_init.sql. This migration:
--   1. links a survey row to its appointment (anti-duplicate) and to the
--      urgent low-score notification it raises (so staff can mark it handled);
--   2. adds a BRANDED token-scoped read (get_survey_page_by_token) so the anon
--      public page can show the clinic name / doctor / Google review link;
--   3. teaches submit_survey_response to raise an URGENT notification naming
--      the patient + comment when a detractor (score <= 3) answers;
--   4. adds mark_survey_handled so staff can close out that complaint.
--
-- Idempotent: add-column-if-not-exists + create-or-replace throughout. Requires
-- 001_init.sql and 004_notifications.sql (create_notification).

-- ---------------------------------------------------------------------------
-- 1. Link columns
-- ---------------------------------------------------------------------------
-- appointment_id: which completed visit this survey belongs to. survey_responses
-- was keyed only to patient/visit_log; the trigger lives on the appointment card
-- so we need a direct link for the "already sent" anti-duplicate check.
alter table survey_responses
  add column if not exists appointment_id uuid
    references appointments (id) on delete set null;

-- notification_id: the urgent alert a low score raised, so "Mark Handled" knows
-- exactly which notification to close.
alter table survey_responses
  add column if not exists notification_id uuid
    references notifications (id) on delete set null;

create index if not exists idx_survey_responses_appointment
  on survey_responses (appointment_id);

-- ---------------------------------------------------------------------------
-- 2. Branded, token-scoped read for the public /s/<token> page
-- ---------------------------------------------------------------------------
-- Exposes ONLY the clinic's public marketing identity (name, doctor, Google
-- review link) plus this one row's answer state. No patient PII, no other rows,
-- no other clinic. A guessed/blank token simply returns no rows.
create or replace function get_survey_page_by_token(p_token text)
returns table (
  responded         boolean,
  score             integer,
  comment           text,
  routed_to         survey_route,
  clinic_name       text,
  doctor_name       text,
  google_review_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (s.responded_at is not null) as responded,
    s.score,
    s.comment,
    s.routed_to,
    c.business_name,
    c.doctor_name,
    c.google_review_url
  from survey_responses s
  join clinics c on c.id = s.clinic_id
  where s.survey_token = p_token;
$$;

revoke execute on function get_survey_page_by_token(text) from public;
grant execute on function get_survey_page_by_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Submit: save the answer AND raise the urgent low-score alert
-- ---------------------------------------------------------------------------
-- Same signature + return type as the 001 version, so create-or-replace is
-- enough (no drop). New behaviour: a detractor score (<= 3) creates an URGENT
-- clinic-wide notification naming the patient + their comment, and the new
-- notification id is remembered on the row for the "Mark Handled" flow.
--
-- Running inside a SECURITY DEFINER function, current_user is this function's
-- owner, so the nested create_notification() call (granted to authenticated
-- only) is permitted even for an anon patient; inside it, auth.uid() is null so
-- the clinic-membership check is skipped, exactly like the scheduled jobs.
create or replace function submit_survey_response(
  p_token   text,
  p_score   integer,
  p_comment text default null
)
returns survey_route
language plpgsql
security definer
set search_path = public
as $$
declare
  v_route   survey_route;
  v_clinic  uuid;
  v_patient uuid;
  v_name    text;
  v_notif   uuid;
  -- Normalise: trim, and treat an empty string as no comment.
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
begin
  if p_score is null or p_score < 1 or p_score > 5 then
    raise exception 'score must be between 1 and 5';
  end if;

  v_route := case when p_score >= 4
    then 'review_request'::survey_route
    else 'private_followup'::survey_route
  end;

  update survey_responses
     set score        = p_score,
         comment      = v_comment,
         responded_at = now(),
         routed_to    = v_route
   where survey_token = p_token
     and responded_at is null
  returning clinic_id, patient_id into v_clinic, v_patient;

  if not found then
    raise exception 'invalid or already-used survey token';
  end if;

  -- Detractor → urgent alert so the clinic can call before a public 1-star lands.
  if p_score <= 3 then
    select full_name into v_name from patients where id = v_patient;
    v_notif := create_notification(
      v_clinic,
      'system'::notification_type,
      'urgent'::notification_priority,
      '⚠ ' || coalesce(v_name, 'A patient') || ' rated ' || p_score || '/5: ' ||
        coalesce('“' || v_comment || '”', '(no comment)') ||
        '. Call them before they post publicly.',
      null,          -- body
      '/reviews',    -- action_url
      v_patient      -- related_patient_id
    );
    update survey_responses
       set notification_id = v_notif
     where survey_token = p_token;
  end if;

  return v_route;
end;
$$;

revoke execute on function submit_survey_response(text, integer, text) from public;
grant execute on function submit_survey_response(text, integer, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Staff marks a low-score complaint handled
-- ---------------------------------------------------------------------------
-- Flips the linked urgent notification to 'acted_on' and keeps the caller's
-- unread badge in sync (mirrors mark_notification_read). Idempotent + clinic
-- scoped: an unknown survey, another clinic's survey, or a survey with no alert
-- is a silent no-op.
create or replace function mark_survey_handled(p_survey_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_clinic uuid;
  v_notif  uuid;
  v_old    notification_status;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select home_clinic_id into v_clinic from profiles where id = v_uid;

  select notification_id into v_notif
    from survey_responses
   where id = p_survey_id
     and clinic_id = v_clinic;
  if v_notif is null then
    return;  -- unknown survey, wrong clinic, or no alert was raised
  end if;

  select status into v_old
    from notifications
   where id = v_notif and clinic_id = v_clinic;
  if v_old is null or v_old = 'acted_on' then
    return;  -- gone or already handled
  end if;

  update notifications
     set status = 'acted_on'
   where id = v_notif and clinic_id = v_clinic;

  -- Only an unread alert was counted in this user's badge.
  if v_old = 'unread' then
    update profiles
       set unread_notification_count = greatest(unread_notification_count - 1, 0)
     where id = v_uid;
  end if;
end;
$$;

revoke execute on function mark_survey_handled(uuid) from public, anon;
grant execute on function mark_survey_handled(uuid) to authenticated;
