-- Gingham: photo storage (run once, after supabase-setup.sql).
-- Supabase → SQL Editor → New query → paste this whole file → Run.
-- Safe to run again. It only adds things; it doesn't touch your family's data.
--
-- Creates a private "photos" folder (bucket) in Supabase Storage. Each family's photos go in
-- photos/<family id>/..., and only signed-in members of that family can see, add or remove them.

-- 1. The bucket: private, pictures only, up to 5 MB each
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- 2. "Is the signed-in person a member of the family this folder belongs to?"
--    (a folder name that isn't a family id simply means no)
create or replace function public.rg_is_member_folder(folder text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.rg_is_member(folder::uuid);
exception when others then
  return false;
end $$;
revoke all on function public.rg_is_member_folder(text) from public, anon;
grant execute on function public.rg_is_member_folder(text) to authenticated;

-- 3. Who may do what with the photo files
drop policy if exists rg_photos_read on storage.objects;
create policy rg_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.rg_is_member_folder((storage.foldername(name))[1]));

drop policy if exists rg_photos_add on storage.objects;
create policy rg_photos_add on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.rg_is_member_folder((storage.foldername(name))[1]));

drop policy if exists rg_photos_change on storage.objects;
create policy rg_photos_change on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.rg_is_member_folder((storage.foldername(name))[1]))
  with check (bucket_id = 'photos' and public.rg_is_member_folder((storage.foldername(name))[1]));

drop policy if exists rg_photos_remove on storage.objects;
create policy rg_photos_remove on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.rg_is_member_folder((storage.foldername(name))[1]));
