-- ================================================================
-- Quotr — Database Schema
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
-- Safe to run on a fresh project. If you ran an earlier setup
-- script, the DROP lines below will cleanly remove old tables first.
-- ================================================================


-- ── Clean up any tables from earlier setup scripts ──────────────
DROP TABLE IF EXISTS quote_items  CASCADE;
DROP TABLE IF EXISTS quotes       CASCADE;
DROP TABLE IF EXISTS clients      CASCADE;
DROP TABLE IF EXISTS profiles     CASCADE;


-- ================================================================
-- TABLE 1: clients
-- Every customer the contractor has ever quoted.
-- ================================================================
CREATE TABLE clients (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL    DEFAULT now(),
  owner_id   UUID        NOT NULL    REFERENCES auth.users(id) ON DELETE CASCADE,

  name       TEXT        NOT NULL,
  email      TEXT,
  phone      TEXT,
  address    TEXT,
  notes      TEXT
);

CREATE INDEX idx_clients_owner ON clients(owner_id);


-- ================================================================
-- TABLE 2: rate_cards
-- The contractor's business info and default pricing rules.
-- One row per contractor (they can update it; we just keep one).
-- ================================================================
CREATE TABLE rate_cards (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL    DEFAULT now(),
  owner_id   UUID        NOT NULL    REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Pricing rules
  labour_rate_per_hour    NUMERIC(10,2) NOT NULL DEFAULT 0,
  material_markup_percent NUMERIC(5,2)  NOT NULL DEFAULT 15,
  vat_percent             NUMERIC(5,2)  NOT NULL DEFAULT 21,
  currency                TEXT          NOT NULL DEFAULT 'EUR',

  -- Business identity (shown on every proposal PDF)
  terms_text       TEXT,
  business_name    TEXT,
  business_address TEXT,
  business_email   TEXT,
  logo_url         TEXT
);

CREATE INDEX idx_rate_cards_owner ON rate_cards(owner_id);


-- ================================================================
-- TABLE 3: jobs
-- One job = one quoting scenario. Holds the raw inputs: what work
-- needs doing, for which client, and the individual line items
-- (stored as JSON so the list can be any length without extra rows).
-- ================================================================
CREATE TABLE jobs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL    DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL    DEFAULT now(),
  owner_id   UUID        NOT NULL    REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id  UUID                    REFERENCES clients(id)    ON DELETE SET NULL,

  title       TEXT NOT NULL,
  description TEXT,

  -- Lifecycle: draft → quoted → sent → accepted / declined
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','quoted','sent','accepted','declined')),

  -- Array of line items, e.g.:
  -- [{ "label":"Install panels","type":"labour","quantity":8,"unit_cost":0,"hours":8 },
  --  { "label":"Solar panel 400W","type":"material","quantity":12,"unit_cost":210 }]
  line_items JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX idx_jobs_owner  ON jobs(owner_id);
CREATE INDEX idx_jobs_client ON jobs(client_id);
CREATE INDEX idx_jobs_status ON jobs(owner_id, status);

-- Auto-bump updated_at whenever a job row changes
CREATE OR REPLACE FUNCTION _touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS jobs_updated_at ON jobs;
CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION _touch_updated_at();


-- ================================================================
-- TABLE 4: proposals
-- The finished, priced, shareable output generated from a job.
-- Holds the computed money totals, the human-readable scope text,
-- and the unique share_token used for the client-facing link.
-- ================================================================
CREATE TABLE proposals (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL    DEFAULT now(),
  owner_id   UUID        NOT NULL    REFERENCES auth.users(id) ON DELETE CASCADE,
  job_id     UUID        NOT NULL    REFERENCES jobs(id)       ON DELETE CASCADE,

  -- Computed money (stored so PDFs are reproducible even if rate card changes)
  -- Shape: { subtotal, vat_amount, total, labour_total, material_total, fixed_total }
  computed_totals JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Human-readable text blocks (AI-generated or typed by contractor)
  scope_text TEXT,
  cover_note TEXT,

  -- Where the generated PDF is stored in Supabase Storage
  pdf_url TEXT,

  -- Unique 32-char token → public URL: /p/[share_token]
  -- Clients click this link to view & accept the quote without logging in
  share_token TEXT UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),

  -- Timestamps set when the client opens / accepts the link
  opened_at   TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ
);

CREATE INDEX idx_proposals_owner ON proposals(owner_id);
CREATE INDEX idx_proposals_job   ON proposals(job_id);
CREATE INDEX idx_proposals_token ON proposals(share_token);


-- ================================================================
-- Row Level Security
-- Each contractor can only read and write their own rows.
-- The share_token public link is handled server-side via the
-- service_role key, so no extra policy needed here.
-- ================================================================

ALTER TABLE clients    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals  ENABLE ROW LEVEL SECURITY;

-- One policy per table: full access, but only to your own rows
CREATE POLICY "owner_full_access" ON clients
  FOR ALL USING     (owner_id = auth.uid())
  WITH CHECK        (owner_id = auth.uid());

CREATE POLICY "owner_full_access" ON rate_cards
  FOR ALL USING     (owner_id = auth.uid())
  WITH CHECK        (owner_id = auth.uid());

CREATE POLICY "owner_full_access" ON jobs
  FOR ALL USING     (owner_id = auth.uid())
  WITH CHECK        (owner_id = auth.uid());

CREATE POLICY "owner_full_access" ON proposals
  FOR ALL USING     (owner_id = auth.uid())
  WITH CHECK        (owner_id = auth.uid());
