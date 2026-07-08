-- ================================================================
-- Quotr — Signature & acceptance audit trail for proposals
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
-- What this does: adds columns to the existing "proposals" table to record
-- who accepted a quote and how — their typed name, a drawn-signature image
-- (as a data URL, only present if they drew rather than typed), and a light
-- audit trail (IP address + browser user-agent) — plus a link to the signed
-- PDF generated at acceptance time.
--
-- This is a pure ADD — it never drops or rewrites anything, so it's safe
-- to run even with existing data, and safe to run more than once.
-- (Unlike supabase-schema.sql, which drops and recreates tables — never
-- re-run that file on a project with real data.)
-- ================================================================

alter table proposals add column if not exists signer_name        text;
alter table proposals add column if not exists signature_data_url text;
alter table proposals add column if not exists accept_ip          text;
alter table proposals add column if not exists accept_user_agent  text;
alter table proposals add column if not exists signed_pdf_url     text;
