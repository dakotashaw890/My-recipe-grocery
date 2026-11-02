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
