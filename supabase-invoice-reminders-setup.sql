-- ================================================================
-- Quotr — Automated payment reminders for invoices
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
--  - Adds reminder SETTINGS to rate_cards: on/off, and how many days
--    before/after the due date each reminder stage fires. Defaults to ON
--    with a standard schedule (3 days before due, on the due date, 7 days
--    overdue, 14 days overdue) so existing contractors get reminders
--    working immediately — no action needed until you want to change the
--    timing (Settings screen, coming in a later step).
--  - Adds the "invoice_reminders" table: one row per reminder actually
--    sent (which invoice, which stage, when) — this is both the "never
--    send the same reminder twice" safeguard and the log shown on the
--    invoice.
--
-- This is a pure ADD — it never drops or rewrites anything, so it's safe
-- to run even with existing data, and safe to run more than once.
-- ================================================================

ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS reminders_enabled          BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS reminder_before_due_days   INTEGER NOT NULL DEFAULT 3;
ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS reminder_overdue_days_1    INTEGER NOT NULL DEFAULT 7;
ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS reminder_overdue_days_2    INTEGER NOT NULL DEFAULT 14;

CREATE TABLE IF NOT EXISTS invoice_reminders (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID        NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  -- before_due: sent reminder_before_due_days before the due date.
  -- due: sent on the due date itself.
  -- overdue_1 / overdue_2: sent reminder_overdue_days_1 / _2 days after.
  stage      TEXT        NOT NULL CHECK (stage IN ('before_due', 'due', 'overdue_1', 'overdue_2')),
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The actual "never send the same reminder twice" guarantee — enforced by
-- the database itself, not just application logic.
CREATE UNIQUE INDEX IF NOT EXISTS invoice_reminders_invoice_stage_unique
  ON invoice_reminders (invoice_id, stage);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_invoice ON invoice_reminders(invoice_id);

ALTER TABLE invoice_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_full_access" ON invoice_reminders;
CREATE POLICY "owner_full_access" ON invoice_reminders
  USING (invoice_id IN (SELECT id FROM invoices WHERE owner_id = auth.uid()))
  WITH CHECK (invoice_id IN (SELECT id FROM invoices WHERE owner_id = auth.uid()));
