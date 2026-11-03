-- Gingham launch setup: daily helper limits + problem reports.
-- Run once in Supabase → SQL Editor → New query → paste all of this → Run. Safe to run again.

-- ============ 1. Daily limits for the helper (photo reads, imports, prices, nutrition) ============
-- Only the helper Edge Function can read or change these counts (it uses the service-role key Supabase gives it).
create table if not exists public.rg_helper_usage (
  user_id uuid not null,
  day date not null default current_date,
  action text not null,
  n integer not null default 0,
  primary key (user_id, day, action)
);
alter table public.rg_helper_usage enable row level security;   -- no policies: the app can't touch it
revoke all on public.rg_helper_usage from anon, authenticated;

-- Adds one use and returns this account's count today and everyone's count today for that action.
create or replace function public.rg_helper_use(p_user uuid, p_action text)
returns table (mine integer, everyone integer)
language plpgsql security definer set search_path = public as $$
begin
  insert into rg_helper_usage (user_id, day, action, n) values (p_user, current_date, left(p_action, 40), 1)
  on conflict (user_id, day, action) do update set n = rg_helper_usage.n + 1
  returning rg_helper_usage.n into mine;
  select coalesce(sum(u.n), 0)::integer into everyone from rg_helper_usage u where u.day = current_date and u.action = left(p_action, 40);
  if random() < 0.01 then delete from rg_helper_usage where day < current_date - 30; end if;   -- tidy old days now and then
  return next;
end $$;

create or replace function public.rg_helper_usage_today(p_user uuid)
returns table (action text, n integer)
language sql security definer set search_path = public as $$
  select u.action, u.n from rg_helper_usage u where u.user_id = p_user and u.day = current_date
$$;

revoke all on function public.rg_helper_use(uuid, text) from public, anon, authenticated;
revoke all on function public.rg_helper_usage_today(uuid) from public, anon, authenticated;
grant execute on function public.rg_helper_use(uuid, text) to service_role;
grant execute on function public.rg_helper_usage_today(uuid) to service_role;

-- ============ 2. Problem reports ============
-- Sent from Settings → Send a problem report. Anyone using the app can send one (signed in or not);
-- nobody can read them back through the app. Read them in Supabase → Table Editor → rg_problem_reports.
create table if not exists public.rg_problem_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  app_version text check (char_length(app_version) <= 40),
  device text check (char_length(device) <= 400),
  screen text check (char_length(screen) <= 40),
  message text check (char_length(message) <= 2000),
  errors jsonb check (pg_column_size(errors) <= 20000),
  contact_ok boolean not null default false
);
alter table public.rg_problem_reports enable row level security;
drop policy if exists "anyone can send a report" on public.rg_problem_reports;
create policy "anyone can send a report" on public.rg_problem_reports
  for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());
grant insert on public.rg_problem_reports to anon, authenticated;
revoke select, update, delete on public.rg_problem_reports from anon, authenticated;

-- ============ 3. Prep reminders (push notifications) ============
-- Phones that turn on reminders save their push address here; the family's upcoming reminders are kept here too.
-- Every 5 minutes Supabase's scheduler asks the helper to send the ones that are due.
-- Needs the pg_cron and pg_net extensions. This tries to turn them on; if it can't, turn them on in
-- Supabase → Database → Extensions (search "pg_cron" and "pg_net") and run this file again.
do $$ begin
  begin create extension if not exists pg_cron; exception when others then raise notice 'Turn on pg_cron in Database → Extensions'; end;
  begin create extension if not exists pg_net with schema extensions; exception when others then raise notice 'Turn on pg_net in Database → Extensions'; end;
end $$;

-- private settings only the helper can read (push signing keys, the scheduler's password)
create table if not exists public.rg_private_settings (key text primary key, value text not null);
alter table public.rg_private_settings enable row level security;
revoke all on public.rg_private_settings from anon, authenticated;
insert into public.rg_private_settings (key, value) values ('cron_key', md5(random()::text || clock_timestamp()::text) || md5(random()::text)) on conflict (key) do nothing;

create table if not exists public.rg_push_subs (
  endpoint text primary key check (char_length(endpoint) <= 1000 and endpoint like 'https://%'),
  user_id uuid not null references auth.users (id) on delete cascade,
  family_id uuid not null references public.rg_families (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 60),
  created_at timestamptz not null default now(),
  fails integer not null default 0
);
alter table public.rg_push_subs enable row level security;
revoke all on public.rg_push_subs from anon, authenticated;

create table if not exists public.rg_reminders (
  family_id uuid not null references public.rg_families (id) on delete cascade,
  key text not null check (char_length(key) <= 200),
  fire_at timestamptz not null,
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 300),
  sent_at timestamptz,
  primary key (family_id, key)
);
alter table public.rg_reminders enable row level security;
revoke all on public.rg_reminders from anon, authenticated;
create index if not exists rg_reminders_due on public.rg_reminders (fire_at) where sent_at is null;

-- a phone turns notifications on / off
create or replace function public.rg_push_subscribe(p_family uuid, p_endpoint text, p_p256dh text, p_auth text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not rg_is_member(p_family) then raise exception 'not in that family' using errcode = '42501'; end if;
  insert into rg_push_subs (endpoint, user_id, family_id, p256dh, auth) values (p_endpoint, auth.uid(), p_family, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, family_id = excluded.family_id, p256dh = excluded.p256dh, auth = excluded.auth, fails = 0;
  return true;
end $$;
create or replace function public.rg_push_unsubscribe(p_endpoint text)
returns boolean language sql security definer set search_path = public as $$
  delete from rg_push_subs where endpoint = p_endpoint and user_id = auth.uid() returning true
$$;
-- replaces the family's upcoming (unsent) reminders with the list the app worked out from the meal plan
create or replace function public.rg_set_reminders(p_family uuid, p_items jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if auth.uid() is null or not rg_is_member(p_family) then raise exception 'not in that family' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 150 then raise exception 'too many reminders'; end if;
  delete from rg_reminders where family_id = p_family and sent_at is null;
  delete from rg_reminders where family_id = p_family and fire_at < now() - interval '3 days';
  insert into rg_reminders (family_id, key, fire_at, title, body)
    select p_family, left(x->>'key', 200), (x->>'at')::timestamptz, left(x->>'title', 120), left(x->>'body', 300)
    from jsonb_array_elements(p_items) x
    where (x->>'at')::timestamptz between now() - interval '10 minutes' and now() + interval '9 days'
  on conflict (family_id, key) do nothing;   -- already sent: don't send it again
  get diagnostics n = row_count;
  return n;
end $$;
-- for the setup check: is this phone's family set up for reminders?
create or replace function public.rg_reminder_status(p_family uuid)
returns table (phones integer, upcoming integer, scheduler boolean)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not rg_is_member(p_family) then raise exception 'not in that family' using errcode = '42501'; end if;
  phones := (select count(*) from rg_push_subs where family_id = p_family);
  upcoming := (select count(*) from rg_reminders where family_id = p_family and sent_at is null);
  begin execute 'select exists (select 1 from cron.job where jobname = ''gingham-reminders'')' into scheduler; exception when others then scheduler := false; end;
  return next;
end $$;

-- ---- used only by the helper (service role) ----
create or replace function public.rg_setting(p_key text, p_default text)
returns text language plpgsql security definer set search_path = public as $$
declare v text;
begin
  insert into rg_private_settings (key, value) values (p_key, p_default) on conflict (key) do nothing;
  select value into v from rg_private_settings where key = p_key;
  return v;
end $$;
-- due reminders for every phone in the family; marks them sent so they go out once
create or replace function public.rg_reminders_due(p_key text)
returns table (family_id uuid, key text, title text, body text, endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = public as $$
begin
  if p_key is null or p_key <> (select value from rg_private_settings where rg_private_settings.key = 'cron_key') then raise exception 'wrong key' using errcode = '42501'; end if;
  return query
    with due as (
      update rg_reminders r set sent_at = now()
      where r.sent_at is null and r.fire_at <= now() + interval '1 minute' and r.fire_at > now() - interval '3 hours'
      returning r.family_id, r.key, r.title, r.body)
    select d.family_id, d.key, d.title, d.body, s.endpoint, s.p256dh, s.auth from due d join rg_push_subs s on s.family_id = d.family_id;
end $$;
create or replace function public.rg_push_result(p_endpoint text, p_gone boolean)
returns void language sql security definer set search_path = public as $$
  delete from rg_push_subs where endpoint = p_endpoint and (p_gone or fails >= 20);
  update rg_push_subs set fails = case when p_gone then fails else fails + 1 end where endpoint = p_endpoint;
$$;
-- the helper calls this (with its own web address) to start the every-5-minutes check
create or replace function public.rg_schedule_reminders(p_url text)
returns boolean language plpgsql security definer set search_path = public as $$
declare k text := (select value from rg_private_settings where key = 'cron_key');
begin
  if p_url !~ '^https://[a-z0-9.-]+/functions/v1/[A-Za-z0-9_-]+$' then raise exception 'bad url'; end if;
  execute format('select cron.schedule(%L, %L, %L)', 'gingham-reminders', '*/5 * * * *',
    format('select net.http_post(url := %L, body := %L::jsonb, headers := %L::jsonb)', p_url, json_build_object('action', 'send-reminders', 'key', k)::text, '{"Content-Type": "application/json"}'));
  return true;
end $$;

revoke all on function public.rg_push_subscribe(uuid, text, text, text) from public, anon;
revoke all on function public.rg_push_unsubscribe(text) from public, anon;
revoke all on function public.rg_set_reminders(uuid, jsonb) from public, anon;
revoke all on function public.rg_reminder_status(uuid) from public, anon;
grant execute on function public.rg_push_subscribe(uuid, text, text, text) to authenticated;
grant execute on function public.rg_push_unsubscribe(text) to authenticated;
grant execute on function public.rg_set_reminders(uuid, jsonb) to authenticated;
grant execute on function public.rg_reminder_status(uuid) to authenticated;
revoke all on function public.rg_setting(text, text) from public, anon, authenticated;
revoke all on function public.rg_reminders_due(text) from public, anon, authenticated;
revoke all on function public.rg_push_result(text, boolean) from public, anon, authenticated;
revoke all on function public.rg_schedule_reminders(text) from public, anon, authenticated;
grant execute on function public.rg_setting(text, text) to service_role;
grant execute on function public.rg_reminders_due(text) to service_role;
grant execute on function public.rg_push_result(text, boolean) to service_role;
grant execute on function public.rg_schedule_reminders(text) to service_role;

-- ========== Cooking timers that ring while the phone sleeps (v44) ==========
-- When a timer starts on a signed-in phone, the app saves when it ends. Every 10 seconds the database checks for timers
-- that are due (a quick query) and only then asks the helper to send the "Time's up" notification.
create table if not exists public.rg_timers (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  due_at timestamptz not null,
  label text not null default '',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.rg_timers enable row level security;
revoke all on public.rg_timers from anon, authenticated;
create index if not exists rg_timers_due on public.rg_timers (due_at) where sent_at is null;

create or replace function public.rg_timer_set(p_id text, p_due timestamptz, p_label text, p_endpoint text, p_p256dh text, p_auth text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_id is null or length(p_id) > 80 or p_due < now() - interval '1 minute' or p_due > now() + interval '24 hours' then raise exception 'bad timer'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'bad endpoint'; end if;
  delete from rg_timers where user_id = auth.uid() and (sent_at is not null or due_at < now() - interval '1 hour');
  if (select count(*) from rg_timers where user_id = auth.uid() and id <> p_id) >= 20 then raise exception 'too many timers'; end if;
  insert into rg_timers (id, user_id, endpoint, p256dh, auth, due_at, label)
    values (p_id, auth.uid(), p_endpoint, left(p_p256dh, 200), left(p_auth, 100), p_due, left(coalesce(p_label, ''), 120))
  on conflict (id) do update set due_at = excluded.due_at, label = excluded.label, endpoint = excluded.endpoint,
    p256dh = excluded.p256dh, auth = excluded.auth, sent_at = null
    where rg_timers.user_id = auth.uid();
  return true;
end $$;
create or replace function public.rg_timer_cancel(p_id text)
returns boolean language sql security definer set search_path = public as $$
  delete from rg_timers where id = p_id and user_id = auth.uid() returning true
$$;
-- used only by the helper: due timers, marked sent so each rings once
create or replace function public.rg_timers_due(p_key text)
returns table (id text, label text, endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = public as $$
begin
  if p_key is null or p_key <> (select value from rg_private_settings where rg_private_settings.key = 'cron_key') then raise exception 'wrong key' using errcode = '42501'; end if;
  return query
    update rg_timers t set sent_at = now()
    where t.sent_at is null and t.due_at <= now() + interval '3 seconds' and t.due_at > now() - interval '30 minutes'
    returning t.id, t.label, t.endpoint, t.p256dh, t.auth;
end $$;
-- run by the scheduler every 10 seconds: calls the helper only when a timer is due
create or replace function public.rg_fire_timers()
returns void language plpgsql security definer set search_path = public as $$
declare u text; k text;
begin
  if not exists (select 1 from rg_timers where sent_at is null and due_at <= now() + interval '3 seconds' and due_at > now() - interval '30 minutes') then return; end if;
  select value into u from rg_private_settings where key = 'helper_url';
  select value into k from rg_private_settings where key = 'cron_key';
  if u is null then return; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)' using u, json_build_object('action', 'send-timers', 'key', k)::jsonb, '{"Content-Type": "application/json"}'::jsonb;
end $$;
-- the helper calls this (with its own web address) to start the every-10-seconds check
create or replace function public.rg_schedule_timers(p_url text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_url !~ '^https://[a-z0-9.-]+/functions/v1/[A-Za-z0-9_-]+$' then raise exception 'bad url'; end if;
  insert into rg_private_settings (key, value) values ('helper_url', p_url) on conflict (key) do update set value = excluded.value;
  execute format('select cron.schedule(%L, %L, %L)', 'gingham-timers', '10 seconds', 'select public.rg_fire_timers()');
  return true;
end $$;
revoke all on function public.rg_timer_set(text, timestamptz, text, text, text, text) from public, anon;
revoke all on function public.rg_timer_cancel(text) from public, anon;
grant execute on function public.rg_timer_set(text, timestamptz, text, text, text, text) to authenticated;
grant execute on function public.rg_timer_cancel(text) to authenticated;
revoke all on function public.rg_timers_due(text) from public, anon, authenticated;
revoke all on function public.rg_fire_timers() from public, anon, authenticated;
revoke all on function public.rg_schedule_timers(text) from public, anon, authenticated;
grant execute on function public.rg_timers_due(text) to service_role;
grant execute on function public.rg_schedule_timers(text) to service_role;
