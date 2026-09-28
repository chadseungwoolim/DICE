-- Aₖ storage setup. Run once in Supabase Dashboard → SQL Editor.
-- Creates a public-read bucket "media" and the minimum policies the site needs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 20971520, array['application/octet-stream', 'video/webm', 'video/mp4'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- upload: anyone with the anon key, only well-formed share ids
drop policy if exists "ak media insert" on storage.objects;
create policy "ak media insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'media' and name ~ '^[twm][A-Za-z0-9]{10}$');

-- delete: only the (anonymous) session that uploaded the object
drop policy if exists "ak media select own" on storage.objects;
create policy "ak media select own" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and owner_id = (select auth.uid())::text);

drop policy if exists "ak media delete own" on storage.objects;
create policy "ak media delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and owner_id = (select auth.uid())::text);

-- Optional: Authentication → Sign In / Providers → enable "Allow anonymous sign-ins".
-- Without it uploads still work (anon role) but links cannot be deleted from the SHARE page.
