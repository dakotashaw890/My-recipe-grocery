-- Gingham: account deletion (run once, after supabase-setup.sql and community-setup.sql).
-- Supabase → SQL Editor → New query → paste this whole file → Run. Safe to run again.
--
-- Lets a signed-in person permanently delete their own account, from the app (Settings) or from
-- the delete-account page. Google Play requires both. What gets deleted:
--   • their sign-in (email and password)
--   • their membership in their family
--   • the family's shared data, if they were its last member (other members keep it otherwise)
--   • recipes they shared to the community library, and any reports they made
-- Photos are files in Storage, which SQL can't delete; the app removes those first.

create or replace function public.rg_delete_my_account() returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  me uuid := auth.uid();
  lonely uuid[];
begin
  if me is null then raise exception 'Sign in first.'; end if;
  -- families where nobody else is a member: delete them (their shared data goes with them)
  select coalesce(array_agg(m.family_id), '{}') into lonely
  from public.rg_members m
  where m.user_id = me
    and not exists (select 1 from public.rg_members o where o.family_id = m.family_id and o.user_id <> me);
  delete from public.rg_families where id = any(lonely);
  -- in families that carry on, stop pointing at this person
  update public.rg_items set updated_by = null where updated_by = me;
  -- the sign-in itself; memberships, shared community recipes and reports go with it
  delete from auth.users where id = me;
  return jsonb_build_object('families_deleted', coalesce(array_length(lonely, 1), 0));
end $$;
revoke all on function public.rg_delete_my_account() from public, anon;
grant execute on function public.rg_delete_my_account() to authenticated;

-- How many people are in a family (the app asks before deleting a family's photos)
create or replace function public.rg_family_size(fid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select case when public.rg_is_member(fid) then (select count(*)::int from public.rg_members where family_id = fid) else 0 end
$$;
revoke all on function public.rg_family_size(uuid) from public, anon;
grant execute on function public.rg_family_size(uuid) to authenticated;

-- Shared-recipe photos: Storage needs "read" and "change" rules (as well as "remove") to replace or
-- delete a file, so each person can do that within their own folder.
drop policy if exists rg_public_photos_own_read on storage.objects;
create policy rg_public_photos_own_read on storage.objects for select to authenticated
  using (bucket_id = 'public-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists rg_public_photos_change on storage.objects;
create policy rg_public_photos_change on storage.objects for update to authenticated
  using (bucket_id = 'public-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'public-photos' and (storage.foldername(name))[1] = auth.uid()::text);
