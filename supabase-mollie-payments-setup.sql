-- ================================================================
-- Quotr — Mollie payments (iDEAL) for invoices
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
--  - Adds 4 columns to the existing "invoices" table so each invoice can
--    remember its own Mollie payment: the payment's id, the hosted
--    checkout URL the client is sent to, Mollie's own status for that
--    payment (open/paid/failed/expired/canceled), and when it was created.
--  - Nothing here changes invoices.status or invoices.paid_at — those
--    still work exactly as they do today. The payment webhook (a later
--    step) is what will set those, the same way "Mark as paid" already
--    does today.
--
-- This is a pure ADD — it never drops or rewrites anything, so it's safe
-- to run even with existing data, and safe to run more than once.
-- ================================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS mollie_payment_id         TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS mollie_checkout_url       TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS mollie_payment_status     TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS mollie_payment_created_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_invoices_mollie_payment_id ON invoices(mollie_payment_id);
