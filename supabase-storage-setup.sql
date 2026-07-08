-- ================================================================
-- Quotr — Storage setup for generated PDFs and business logos
-- ================================================================
--
-- WHERE TO PASTE THIS:
--   1. Go to https://supabase.com/dashboard
--   2. Open your project (ojzwlttzdipijllzqqix)
--   3. Left sidebar → "SQL Editor"
--   4. Click "New query"
--   5. Select all text below and paste it in
--   6. Click the green "Run" button (or press Ctrl+Enter / Cmd+Enter)
--
-- What this does: creates two public storage buckets —
--   "proposals" holds the branded PDF for each quote
--   "logos"     holds each contractor's uploaded business logo
-- — and sets up rules so a contractor can only upload/replace files
-- inside their own folder (<bucket>/<their-user-id>/...), while anyone
-- can read a file once it's uploaded (needed so the public share link
-- and PDF can show it).
-- Safe to run more than once — if you already ran an earlier version of
-- this file for "proposals", re-running it just adds the "logos" bucket.
-- ================================================================

insert into storage.buckets (id, name, public)
values
  ('proposals', 'proposals', true),
  ('logos',     'logos',     true)
on conflict (id) do nothing;

drop policy if exists "proposal_pdfs_public_read"   on storage.objects;
drop policy if exists "proposal_pdfs_owner_write"   on storage.objects;
drop policy if exists "proposal_pdfs_owner_update"  on storage.objects;
drop policy if exists "proposal_pdfs_owner_delete"  on storage.objects;
drop policy if exists "logos_public_read"           on storage.objects;
drop policy if exists "logos_owner_write"           on storage.objects;
drop policy if exists "logos_owner_update"          on storage.objects;
drop policy if exists "logos_owner_delete"          on storage.objects;

-- Anyone can view/download a generated PDF (bucket is public anyway,
-- but Supabase still checks a SELECT policy for the storage API).
create policy "proposal_pdfs_public_read"
  on storage.objects for select
  using (bucket_id = 'proposals');

-- A contractor can only write into proposals/<their own user id>/...
create policy "proposal_pdfs_owner_write"
  on storage.objects for insert
  with check (bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "proposal_pdfs_owner_update"
  on storage.objects for update
  using (bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "proposal_pdfs_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'proposals' and (storage.foldername(name))[1] = auth.uid()::text);

-- Anyone can view a logo (it's shown on the public share page and in PDFs).
create policy "logos_public_read"
  on storage.objects for select
  using (bucket_id = 'logos');

-- A contractor can only write into logos/<their own user id>/...
create policy "logos_owner_write"
  on storage.objects for insert
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "logos_owner_update"
  on storage.objects for update
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "logos_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);
