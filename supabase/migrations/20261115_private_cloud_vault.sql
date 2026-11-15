-- PLOTWEAVER v1.2 manual encrypted cloud vault.
-- Run once in the SAME Supabase project used for Google OAuth.
-- The bucket is private. Authenticated users can only append/list/download
-- encrypted backups under their own UUID prefix. No update/delete policies.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('plotweaver-backups','plotweaver-backups',false,52428800,array['application/octet-stream'])
on conflict (id) do nothing;

create policy "plotweaver_vault_read_own"
on storage.objects for select to authenticated
using (
 bucket_id='plotweaver-backups'
 and (storage.foldername(name))[1]=(select auth.uid())::text
);

create policy "plotweaver_vault_append_own"
on storage.objects for insert to authenticated
with check (
 bucket_id='plotweaver-backups'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and storage.extension(name)='pwenc'
);
