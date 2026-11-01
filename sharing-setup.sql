-- Gingham: sharing recipes by link and with other families (run once, after supabase-setup.sql).
-- Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
--
-- Links:   a signed-in person makes a short link to one recipe; anyone with the link can open it
--          (only through rg_open_link, so links can't be listed or searched).
-- Families: each family has a public "share code" (not the join code!). Another family types it once
--          to send recipes, which land in the receiving family's inbox.

-- 1. Recipe links
create table if not exists public.rg_recipe_links (
  code text primary key,
  name text not null check (char_length(name) between 1 and 120),
  recipe jsonb not null check (pg_column_size(recipe) < 60000),
  photo_url text check (photo_url is null or photo_url ~ '^https://'),
  from_name text check (from_name is null or char_length(from_name) <= 60),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists rg_recipe_links_by on public.rg_recipe_links (created_by, created_at);
alter table public.rg_recipe_links enable row level security;
drop policy if exists rg_links_own on public.rg_recipe_links;
create policy rg_links_own on public.rg_recipe_links for delete to authenticated using (created_by = auth.uid());

create or replace function public.rg_random_code(n int) returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, n)
$$;

create or replace function public.rg_share_link(p_name text, p_recipe jsonb, p_photo text, p_from text)
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if auth.uid() is null then raise exception 'Sign in to share links.'; end if;
  if (select count(*) from public.rg_recipe_links where created_by = auth.uid() and created_at > now() - interval '1 day') >= 100 then
    raise exception 'That''s a lot of links today. Try again tomorrow.';
  end if;
  loop
    c := public.rg_random_code(8);
    begin
      insert into public.rg_recipe_links (code, name, recipe, photo_url, from_name)
      values (c, left(p_name, 120), p_recipe, nullif(p_photo, ''), left(nullif(p_from, ''), 60));
      return c;
    exception when unique_violation then -- try another code
    end;
  end loop;
end $$;
revoke all on function public.rg_share_link(text, jsonb, text, text) from public, anon;
grant execute on function public.rg_share_link(text, jsonb, text, text) to authenticated;

create or replace function public.rg_open_link(p_code text)
returns table (name text, recipe jsonb, photo_url text, from_name text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select name, recipe, photo_url, from_name, created_at from public.rg_recipe_links where code = upper(p_code)
$$;
revoke all on function public.rg_open_link(text) from public;
grant execute on function public.rg_open_link(text) to anon, authenticated;

-- 2. Each family's public share code
alter table public.rg_families add column if not exists share_code text unique;

create or replace function public.rg_family_share_code(fid uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.rg_is_member(fid) then raise exception 'Not your family.'; end if;
  select share_code into c from public.rg_families where id = fid;
  while c is null loop
    begin
      c := public.rg_random_code(4) || '-' || public.rg_random_code(4);
      update public.rg_families set share_code = c where id = fid;
    exception when unique_violation then c := null;
    end;
  end loop;
  return c;
end $$;
revoke all on function public.rg_family_share_code(uuid) from public, anon;
grant execute on function public.rg_family_share_code(uuid) to authenticated;

create or replace function public.rg_family_by_share_code(p_code text) returns text
language sql stable security definer set search_path = public as $$
  select name from public.rg_families where share_code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')) or replace(share_code, '-', '') = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'))
$$;
revoke all on function public.rg_family_by_share_code(text) from public, anon;
grant execute on function public.rg_family_by_share_code(text) to authenticated;

-- 3. Inbox: recipes other families sent you
create table if not exists public.rg_inbox (
  id uuid primary key default gen_random_uuid(),
  to_family uuid not null references public.rg_families(id) on delete cascade,
  from_family uuid references public.rg_families(id) on delete set null,
  from_name text check (from_name is null or char_length(from_name) <= 60),
  name text not null check (char_length(name) between 1 and 120),
  recipe jsonb not null check (pg_column_size(recipe) < 60000),
  photo_url text check (photo_url is null or photo_url ~ '^https://'),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists rg_inbox_to on public.rg_inbox (to_family, created_at desc);
alter table public.rg_inbox enable row level security;
drop policy if exists rg_inbox_read on public.rg_inbox;
create policy rg_inbox_read on public.rg_inbox for select to authenticated using (public.rg_is_member(to_family));
drop policy if exists rg_inbox_remove on public.rg_inbox;
create policy rg_inbox_remove on public.rg_inbox for delete to authenticated using (public.rg_is_member(to_family));

create or replace function public.rg_send_recipe(p_code text, p_from_family uuid, p_from_name text, p_name text, p_recipe jsonb, p_photo text, p_note text)
returns text language plpgsql security definer set search_path = public as $$
declare target uuid; target_name text; clean text := upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
begin
  if not public.rg_is_member(p_from_family) then raise exception 'Join a family before sending recipes.'; end if;
  select id, name into target, target_name from public.rg_families where replace(share_code, '-', '') = clean;
  if target is null then raise exception 'No family has that share code. Check it and try again.'; end if;
  if target = p_from_family then raise exception 'That''s your own family''s code.'; end if;
  if (select count(*) from public.rg_inbox where from_family = p_from_family and created_at > now() - interval '1 day') >= 50 then
    raise exception 'That''s a lot of recipes today. Try again tomorrow.';
  end if;
  insert into public.rg_inbox (to_family, from_family, from_name, name, recipe, photo_url, note)
  values (target, p_from_family, left(nullif(p_from_name, ''), 60), left(p_name, 120), p_recipe, nullif(p_photo, ''), left(nullif(p_note, ''), 300));
  return target_name;
end $$;
revoke all on function public.rg_send_recipe(text, uuid, text, text, jsonb, text, text) from public, anon;
grant execute on function public.rg_send_recipe(text, uuid, text, text, jsonb, text, text) to authenticated;
