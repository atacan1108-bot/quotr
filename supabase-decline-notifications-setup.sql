-- ================================================================
-- Quotr — Customer decline action + contractor notification settings
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
--  - Lets a customer decline a quote on the public share page (mirrors the
--    existing accept columns): when it happened, an optional reason they
--    typed, and a light audit trail (IP + browser), same shape as the
--    existing signature/accept columns.
--  - Adds the contractor's own notification preferences to rate_cards:
--    whether to email them on accept, on decline, and where to send it
--    (defaults to their business email if left blank).
--
-- This is a pure ADD — it never drops or rewrites anything, so it's safe
-- to run even with existing data, and safe to run more than once.
-- ================================================================

alter table proposals add column if not exists declined_at        timestamptz;
alter table proposals add column if not exists decline_reason     text;
alter table proposals add column if not exists decline_ip         text;
alter table proposals add column if not exists decline_user_agent text;

alter table rate_cards add column if not exists notify_on_accept  boolean not null default true;
alter table rate_cards add column if not exists notify_on_decline boolean not null default true;
alter table rate_cards add column if not exists notification_email text;
