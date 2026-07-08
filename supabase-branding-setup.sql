-- ================================================================
-- Quotr — Per-contractor branding + template import
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
-- What this does:
--   1. Adds a "branding" JSON column to rate_cards for the newer brand
--      fields (colors, font, phone, website, KvK, BTW, IBAN, footer
--      tagline, quote-number prefix). Your existing business_name,
--      business_address, business_email, logo_url, and terms_text columns
--      are untouched and stay the source of truth for those.
--   2. Creates a PRIVATE "templates" storage bucket for uploaded source
--      documents (old quote templates a contractor uploads to import their
--      branding from). Unlike "logos"/"proposals", this bucket is NOT
--      public — only the owning contractor can read or write their own
--      uploaded files. These are raw source files, not meant to be shared.
--
-- Pure additions — no data loss. Safe to run more than once.
-- ================================================================

alter table rate_cards add column if not exists branding jsonb default '{}'::jsonb;

insert into storage.buckets (id, name, public)
values ('templates', 'templates', false)
on conflict (id) do nothing;

drop policy if exists "templates_owner_read"   on storage.objects;
drop policy if exists "templates_owner_write"  on storage.objects;
drop policy if exists "templates_owner_update" on storage.objects;
drop policy if exists "templates_owner_delete" on storage.objects;

-- Only the owning contractor can read, write, update, or delete their own
-- uploaded template files — never public, unlike logos/proposals.
create policy "templates_owner_read"
  on storage.objects for select
  using (bucket_id = 'templates' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "templates_owner_write"
  on storage.objects for insert
  with check (bucket_id = 'templates' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "templates_owner_update"
  on storage.objects for update
  using (bucket_id = 'templates' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "templates_owner_delete"
  on storage.objects for delete
  using (bucket_id = 'templates' and (storage.foldername(name))[1] = auth.uid()::text);
