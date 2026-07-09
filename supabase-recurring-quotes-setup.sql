-- ================================================================
-- Quotr — Recurring service contracts (second pricing mode)
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
--   1. Adds "quote_type" to jobs — 'one_off' (default, unchanged behavior for
--      every existing job) or 'recurring'.
--   2. Adds "recurring_config" to jobs — a small JSON block holding the
--      per-quote contract facts (days/week, weeks/year, contract length,
--      notice period, auto-renewal). Only used when quote_type = 'recurring'.
--   3. Adds recurring pricing defaults to rate_cards — day rate, hours/day,
--      weekend/holiday surcharge %, extra-work hourly rate, and whether you
--      quote prices excluding VAT. All optional (null until you set them in
--      Settings) — existing one-off pricing fields are untouched.
--
-- Pure additions — no data loss. Safe to run more than once.
-- ================================================================

alter table jobs add column if not exists quote_type text not null default 'one_off'
  check (quote_type in ('one_off', 'recurring'));

alter table jobs add column if not exists recurring_config jsonb;

alter table rate_cards add column if not exists day_rate numeric(10,2);
alter table rate_cards add column if not exists hours_per_day numeric(5,2);
alter table rate_cards add column if not exists weekend_surcharge_percent numeric(5,2);
alter table rate_cards add column if not exists holiday_surcharge_percent numeric(5,2);
alter table rate_cards add column if not exists extra_work_hourly_rate numeric(10,2);
alter table rate_cards add column if not exists prices_shown_excluding_vat boolean not null default false;
