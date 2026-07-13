-- ================================================================
-- Quotr — Invoicing
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
--  - Adds the "invoices" table: one row per invoice, with its own
--    snapshotted client details and line items (so a sent/paid invoice
--    never silently changes if the client record or rate card changes
--    later), a due date, and payment details.
--  - Adds a real, atomically-incremented invoice-number counter to
--    rate_cards (invoice_next_sequence / invoice_next_sequence_year) plus
--    the assign_invoice_number() function that hands out numbers like
--    "2026-0001", resetting to 0001 every calendar year, gap-free and
--    safe under concurrent requests (it locks the contractor's own
--    rate_cards row while assigning). All other invoice settings
--    (number prefix, payment terms, footer note, account holder name)
--    live in the existing rate_cards.branding JSON column, same as
--    kvk/btw/iban/quoteNumberPrefix already do.
--  - Adds a public "invoices" storage bucket for generated invoice PDFs,
--    same access rules as the existing "proposals" bucket.
--
-- This is a pure ADD — it never drops or rewrites anything, so it's safe
-- to run even with existing data, and safe to run more than once.
-- ================================================================

ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS invoice_next_sequence      INTEGER NOT NULL DEFAULT 1;
ALTER TABLE rate_cards ADD COLUMN IF NOT EXISTS invoice_next_sequence_year INTEGER;

-- ================================================================
-- TABLE: invoices
-- ================================================================
CREATE TABLE IF NOT EXISTS invoices (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL    DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL    DEFAULT now(),
  owner_id   UUID        NOT NULL    REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id  UUID                    REFERENCES clients(id)    ON DELETE SET NULL,
  -- Source quote, if created via "Convert to invoice". Null for from-scratch invoices.
  job_id     UUID                    REFERENCES jobs(id)       ON DELETE SET NULL,

  title    TEXT,
  language TEXT NOT NULL DEFAULT 'nl' CHECK (language IN ('nl','en')),

  -- Numbering — NULL until the invoice is sent (drafts don't burn a number).
  -- See assign_invoice_number() below.
  invoice_number  TEXT,
  invoice_year    INTEGER,
  sequence_number INTEGER,

  -- Client identity, snapshotted at creation time — an invoice must not
  -- silently change if the client record is edited/deleted afterward,
  -- unlike proposals which read the client record live.
  client_name    TEXT NOT NULL,
  client_address TEXT,
  client_email   TEXT,
  client_btw     TEXT,
  client_kvk     TEXT,

  -- The ONE line-item list for this invoice — InvoiceLineItem[], see
  -- src/lib/pricing.ts. Not the same array as jobs.line_items: this is a
  -- snapshot, taken at creation (whether from scratch or converted).
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb,

  discount_type  TEXT CHECK (discount_type IN ('amount','percent')),
  discount_value NUMERIC(12,2),
  reverse_charge BOOLEAN NOT NULL DEFAULT false,

  -- Computed money (stored so PDFs stay reproducible), shape:
  -- { subtotal, discount_amount, taxable_subtotal, vat_breakdown, vat_amount, total, reverse_charge }
  computed_totals JSONB NOT NULL DEFAULT '{}'::jsonb,

  invoice_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date           DATE NOT NULL,
  payment_terms_days INTEGER NOT NULL DEFAULT 30,
  payment_reference  TEXT,
  note_text          TEXT,

  status  TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid')),
  -- 'overdue' is DERIVED (status='sent' + due_date < today) — never stored,
  -- mirrors how quotes derive their own display status from timestamps.
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  pdf_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoices_owner  ON invoices(owner_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_job    ON invoices(job_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(owner_id, status);

-- Defensive backstop: even though assign_invoice_number() is written to
-- never hand out a duplicate, this constraint guarantees the database
-- itself can never end up with one — a bug becomes a hard error instead
-- of a silent duplicate invoice number.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_owner_number_unique
  ON invoices (owner_id, invoice_number) WHERE invoice_number IS NOT NULL;

DROP TRIGGER IF EXISTS invoices_updated_at ON invoices;
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION _touch_updated_at();

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_full_access" ON invoices;
CREATE POLICY "owner_full_access" ON invoices
  FOR ALL USING     (owner_id = auth.uid())
  WITH CHECK        (owner_id = auth.uid());

-- ================================================================
-- Atomic, gap-free invoice numbering
-- ================================================================
-- Runs with the CALLER's own privileges (not SECURITY DEFINER), so
-- ordinary RLS on rate_cards/invoices still applies. The "FOR UPDATE" row
-- lock on the contractor's own rate_cards row is what serializes
-- concurrent "mark as sent" calls from that contractor, so two requests
-- racing each other can never be handed the same number.
CREATE OR REPLACE FUNCTION assign_invoice_number(p_invoice_id UUID) RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_owner_id      UUID;
  v_invoice_date  DATE;
  v_year          INTEGER;
  v_prefix        TEXT;
  v_seq           INTEGER;
  v_number        TEXT;
BEGIN
  SELECT owner_id, invoice_date INTO v_owner_id, v_invoice_date
    FROM invoices WHERE id = p_invoice_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'invoice not found: %', p_invoice_id;
  END IF;

  v_year := EXTRACT(YEAR FROM v_invoice_date);

  -- Lock the contractor's rate_cards row for the duration of this
  -- transaction — any concurrent call for the same owner blocks here
  -- until this one commits.
  PERFORM 1 FROM rate_cards WHERE owner_id = v_owner_id FOR UPDATE;

  SELECT
    COALESCE(branding->>'invoiceNumberPrefix', ''),
    CASE WHEN invoice_next_sequence_year IS DISTINCT FROM v_year THEN 1 ELSE invoice_next_sequence END
  INTO v_prefix, v_seq
  FROM rate_cards WHERE owner_id = v_owner_id;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'no rate_cards row for owner %', v_owner_id;
  END IF;

  UPDATE rate_cards
    SET invoice_next_sequence = v_seq + 1, invoice_next_sequence_year = v_year
    WHERE owner_id = v_owner_id;

  v_number := v_prefix || v_year::text || '-' || lpad(v_seq::text, 4, '0');

  UPDATE invoices
    SET invoice_number = v_number, invoice_year = v_year, sequence_number = v_seq,
        status = 'sent', sent_at = now()
    WHERE id = p_invoice_id;

  RETURN v_number;
END;
$$;

-- ================================================================
-- Storage bucket for generated invoice PDFs — same access pattern as
-- the existing "proposals" bucket (public read, owner-only write).
-- ================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "invoice_pdfs_public_read"  ON storage.objects;
DROP POLICY IF EXISTS "invoice_pdfs_owner_write"  ON storage.objects;
DROP POLICY IF EXISTS "invoice_pdfs_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "invoice_pdfs_owner_delete" ON storage.objects;

CREATE POLICY "invoice_pdfs_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'invoices');

CREATE POLICY "invoice_pdfs_owner_write"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "invoice_pdfs_owner_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "invoice_pdfs_owner_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'invoices' AND (storage.foldername(name))[1] = auth.uid()::text);
