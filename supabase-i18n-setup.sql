-- ================================================================
-- Quotr — Bilingual (nl/en) support: language columns
-- ================================================================
-- Run in: Supabase Dashboard → SQL Editor → New query
--
-- Two independent language fields:
--   rate_cards.language — the CONTRACTOR's app language (the "NL | EN"
--     corner switch). New contractors default to Dutch.
--   jobs.language — the QUOTE's own language, copied from the
--     contractor's app language at creation time but changeable per
--     quote afterward. Drives the PDF, the public share page, and the
--     AI-generated wording for that quote, regardless of who's viewing
--     it or what their own app language is set to.
-- ================================================================

ALTER TABLE rate_cards
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'nl'
    CHECK (language IN ('nl', 'en'));

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'nl'
    CHECK (language IN ('nl', 'en'));
