-- Gingham: community recipes (run once, after supabase-setup.sql).
-- Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
--
-- A public library of recipes families choose to share. Anyone using the app can browse it
-- (even without an account). Publishing, reporting and removing need an account, and people can
-- only change their own recipes. A recipe reported by 3 different people is hidden until you
-- review it: Table Editor → rg_public_recipes → set hidden to false and reports to 0 (or delete it).

create table if not exists public.rg_public_recipes (
  id uuid primary key default gen_random_uuid(),
  author uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name text not null default 'A Gingham kitchen' check (char_length(author_name) between 1 and 60),
  name text not null check (char_length(name) between 1 and 120),
  recipe jsonb not null check (pg_column_size(recipe) < 60000),
  source_url text check (source_url is null or source_url ~ '^https://'),
  source_name text check (source_name is null or char_length(source_name) <= 80),
  photo_url text check (photo_url is null or photo_url ~ '^https://'),
  saves integer not null default 0,
  reports integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rg_public_recipes_list on public.rg_public_recipes (hidden, saves desc, updated_at desc);
create index if not exists rg_public_recipes_author on public.rg_public_recipes (author);

create table if not exists public.rg_public_reports (
  recipe_id uuid not null references public.rg_public_recipes(id) on delete cascade,
  reporter uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  primary key (recipe_id, reporter)
);

-- People in the app can't set counts, hiding or authorship themselves. (You can, from the dashboard.)
create or replace function public.rg_public_guard() returns trigger language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.author := auth.uid(); new.saves := 0; new.reports := 0; new.hidden := false; new.created_at := now();
      if (select count(*) from public.rg_public_recipes where author = auth.uid()) >= 300 then
        raise exception 'You have shared the most recipes allowed (300).' using errcode = 'P0001';
      end if;
    else
      new.author := old.author; new.saves := old.saves; new.reports := old.reports; new.hidden := old.hidden; new.created_at := old.created_at;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists rg_public_guard on public.rg_public_recipes;
create trigger rg_public_guard before insert or update on public.rg_public_recipes for each row execute function public.rg_public_guard();

-- Three reports from different people hide a recipe
create or replace function public.rg_public_reported() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.rg_public_recipes set reports = reports + 1, hidden = (reports + 1 >= 3) where id = new.recipe_id;
  return new;
end $$;
drop trigger if exists rg_public_reported on public.rg_public_reports;
create trigger rg_public_reported after insert on public.rg_public_reports for each row execute function public.rg_public_reported();

-- "Saved by N families" counter
create or replace function public.rg_public_saved(rid uuid) returns void language sql security definer set search_path = public as $$
  update public.rg_public_recipes set saves = saves + 1 where id = rid and not hidden;
$$;

alter table public.rg_public_recipes enable row level security;
alter table public.rg_public_reports enable row level security;

drop policy if exists rg_public_read on public.rg_public_recipes;
create policy rg_public_read on public.rg_public_recipes for select to anon, authenticated using (not hidden or author = auth.uid());
drop policy if exists rg_public_add on public.rg_public_recipes;
create policy rg_public_add on public.rg_public_recipes for insert to authenticated with check (author = auth.uid());
drop policy if exists rg_public_change on public.rg_public_recipes;
create policy rg_public_change on public.rg_public_recipes for update to authenticated using (author = auth.uid()) with check (author = auth.uid());
drop policy if exists rg_public_remove on public.rg_public_recipes;
create policy rg_public_remove on public.rg_public_recipes for delete to authenticated using (author = auth.uid());
drop policy if exists rg_public_report on public.rg_public_reports;
create policy rg_public_report on public.rg_public_reports for insert to authenticated with check (reporter = auth.uid());

grant select on public.rg_public_recipes to anon, authenticated;
grant insert, update, delete on public.rg_public_recipes to authenticated;
grant insert on public.rg_public_reports to authenticated;
revoke all on function public.rg_public_saved(uuid) from public;
grant execute on function public.rg_public_saved(uuid) to anon, authenticated;

-- Photos of shared recipes: a public folder; each person can only add to or remove from their own subfolder
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('public-photos', 'public-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists rg_public_photos_add on storage.objects;
create policy rg_public_photos_add on storage.objects for insert to authenticated
  with check (bucket_id = 'public-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists rg_public_photos_remove on storage.objects;
create policy rg_public_photos_remove on storage.objects for delete to authenticated
  using (bucket_id = 'public-photos' and (storage.foldername(name))[1] = auth.uid()::text);
