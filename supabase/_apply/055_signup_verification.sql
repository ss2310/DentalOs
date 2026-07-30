-- 055_signup_verification.sql
-- Anti-bot signup hardening: email verification codes + a durable signup
-- rate-limit counter.
--
-- WHY
-- ---
-- Signup creates users via the admin API with `email_confirm: true`, so an
-- account never has to prove its inbox exists — bots registered gibberish
-- clinics with dotted-Gmail addresses (Gmail ignores dots, so one inbox can
-- mint unlimited "unique" emails). The in-memory rate limiter (SEC-H3) resets
-- on every deploy/instance, so a slow drip walks straight through it.
--
-- WHAT
-- ----
-- 1. email_verifications — a 6-digit code, HMAC-hashed (the DB never holds a
--    usable code), emailed to the address BEFORE any clinic/user row is
--    created. Keyed on the CANONICAL email (lowercased; Gmail dots and +tags
--    stripped by the app) so dotted variants share one cooldown/attempt
--    budget. Service-role only: RLS enabled with ZERO policies and all client
--    grants revoked.
-- 2. bump_verification_attempts() — atomic attempt counter (an app-side
--    read-modify-write would race concurrent guesses past the cap).
-- 3. signup_rate_limits + check_signup_rate() — fixed-window counters that
--    survive deploys, keyed by the caller (e.g. 'signup:ip:1.2.3.4'),
--    self-pruning. Called only by server actions through the service role.
--
-- The app degrades gracefully when this migration isn't applied yet (missing
-- table/function => the old behavior), so deploy order doesn't matter — but
-- the protection is live only after this is pasted.

-- 1) Verification codes ------------------------------------------------------

create table if not exists email_verifications (
  email        text primary key,                 -- canonical form, lowercase
  code_hash    text not null,                    -- hmac-sha256(secret, email:code)
  expires_at   timestamptz not null,
  attempts     int not null default 0,
  last_sent_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  constraint email_verifications_email_lower check (email = lower(email))
);

alter table email_verifications enable row level security;
-- Zero policies on purpose: only the service role (which bypasses RLS) may
-- touch this table. Belt-and-braces: revoke the client grants too.
revoke all on table email_verifications from anon, authenticated;

create or replace function bump_verification_attempts(p_email text)
returns int
language sql
security definer
set search_path = ''
as $$
  update public.email_verifications
     set attempts = attempts + 1
   where email = p_email
   returning attempts;
$$;

-- Supabase auto-grants EXECUTE on new functions to anon/authenticated —
-- revoke so only the service role can call these.
revoke execute on function bump_verification_attempts(text) from public, anon, authenticated;

-- 2) Durable rate-limit counters --------------------------------------------

create table if not exists signup_rate_limits (
  bucket_key   text not null,
  window_start timestamptz not null,
  hits         int not null default 1,
  primary key (bucket_key, window_start)
);

alter table signup_rate_limits enable row level security;
revoke all on table signup_rate_limits from anon, authenticated;

-- Fixed-window counter: true = allowed, false = over the limit. Atomic via
-- ON CONFLICT so concurrent calls can't both sneak under the cap. Each call
-- opportunistically prunes the key's stale windows so the table stays tiny.
create or replace function check_signup_rate(
  p_key text,
  p_limit int,
  p_window_secs int
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := to_timestamp(
    floor(extract(epoch from now()) / p_window_secs) * p_window_secs
  );
  v_hits int;
begin
  delete from public.signup_rate_limits
   where bucket_key = p_key
     and window_start < now() - make_interval(secs => p_window_secs * 2);

  insert into public.signup_rate_limits as r (bucket_key, window_start, hits)
  values (p_key, v_start, 1)
  on conflict (bucket_key, window_start)
    do update set hits = r.hits + 1
  returning hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

revoke execute on function check_signup_rate(text, int, int) from public, anon, authenticated;
