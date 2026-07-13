-- ================================================================
-- Quotr — Email sending for quotes and invoices
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
-- What this does: records when a quote/invoice's PDF was actually emailed
-- to a client and to which address, so the app can show a "Sent to
-- client@example.com on 14 July" confirmation. invoices already has
-- sent_at/status from the invoicing feature (assigning the invoice number
-- already flips status to 'sent'), so it only needs the recipient address;
-- proposals has neither yet, so it gets both.
--
-- This is a pure ADD — it never drops or rewrites anything, so it's safe
-- to run even with existing data, and safe to run more than once.
-- ================================================================

ALTER TABLE proposals ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS email_sent_to TEXT;
ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS email_sent_to TEXT;
