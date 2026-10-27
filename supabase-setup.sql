-- My Recipe & Grocery: family sync setup
-- Run this once in Supabase: SQL Editor → New query → paste everything → Run.
-- It is safe to run again; it only creates what is missing and refreshes the rules.
-- All tables start with "rg_" so they won't collide with anything else in your project.

-- Families: one shared kitchen. Phones join with the join code.
create table if not exists public.rg_families (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our kitchen',
  join_code text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Who belongs to which family.
create table if not exists public.rg_members (
  family_id uuid not null references public.rg_families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);

-- The shared data: one row per recipe, plan slot, pantry item, checked item, photo, etc.
-- Rows are never hard-deleted by the app; "deleted" marks removals so other phones see them.
create table if not exists public.rg_items (
  family_id uuid not null references public.rg_families(id) on delete cascade,
  key text not null,
  value jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid,
  primary key (family_id, key)
);
create index if not exists rg_items_family_updated on public.rg_items (family_id, updated_at);

-- The server stamps every change, so phones with wrong clocks can't confuse the order.
create or replace function public.rg_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists rg_items_touch on public.rg_items;
create trigger rg_items_touch before insert or update on public.rg_items
  for each row execute function public.rg_touch();

-- Membership check used by the access rules.
create or replace function public.rg_is_member(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rg_members where family_id = fid and user_id = auth.uid());
$$;

-- Create a family (the signed-in person becomes its first member).
create or replace function public.rg_create_family(p_name text, p_display_name text)
returns table (id uuid, name text, join_code text)
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_id uuid;
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  loop
    select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '')
      into v_code from generate_series(1, 8);
    exit when not exists (select 1 from public.rg_families f where f.join_code = v_code);
  end loop;
  insert into public.rg_families (name, join_code, created_by)
    values (coalesce(nullif(trim(p_name), ''), 'Our kitchen'), v_code, auth.uid())
    returning rg_families.id into v_id;
  insert into public.rg_members (family_id, user_id, display_name)
    values (v_id, auth.uid(), nullif(trim(p_display_name), ''));
  return query select f.id, f.name, f.join_code from public.rg_families f where f.id = v_id;
end $$;

-- Join a family with its code.
create or replace function public.rg_join_family(p_code text, p_display_name text)
returns table (id uuid, name text, join_code text)
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select f.id into v_id from public.rg_families f
    where f.join_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_id is null then raise exception 'No family found with that code'; end if;
  insert into public.rg_members (family_id, user_id, display_name)
    values (v_id, auth.uid(), nullif(trim(p_display_name), ''))
    on conflict (family_id, user_id) do update set display_name = coalesce(excluded.display_name, rg_members.display_name);
  return query select f.id, f.name, f.join_code from public.rg_families f where f.id = v_id;
end $$;

-- Access rules: you can only see and change data for families you belong to.
alter table public.rg_families enable row level security;
alter table public.rg_members enable row level security;
alter table public.rg_items enable row level security;

drop policy if exists rg_families_read on public.rg_families;
create policy rg_families_read on public.rg_families for select to authenticated using (public.rg_is_member(id));

drop policy if exists rg_members_read on public.rg_members;
create policy rg_members_read on public.rg_members for select to authenticated using (public.rg_is_member(family_id));
drop policy if exists rg_members_leave on public.rg_members;
create policy rg_members_leave on public.rg_members for delete to authenticated using (user_id = auth.uid());

drop policy if exists rg_items_read on public.rg_items;
create policy rg_items_read on public.rg_items for select to authenticated using (public.rg_is_member(family_id));
drop policy if exists rg_items_add on public.rg_items;
create policy rg_items_add on public.rg_items for insert to authenticated with check (public.rg_is_member(family_id));
drop policy if exists rg_items_change on public.rg_items;
create policy rg_items_change on public.rg_items for update to authenticated
  using (public.rg_is_member(family_id)) with check (public.rg_is_member(family_id));

-- Table and function permissions: nothing for signed-out visitors.
revoke all on public.rg_families, public.rg_members, public.rg_items from anon;
grant select on public.rg_families to authenticated;
grant select, delete on public.rg_members to authenticated;
grant select, insert, update on public.rg_items to authenticated;
revoke all on function public.rg_create_family(text, text), public.rg_join_family(text, text), public.rg_is_member(uuid) from public, anon;
grant execute on function public.rg_create_family(text, text), public.rg_join_family(text, text), public.rg_is_member(uuid) to authenticated;
