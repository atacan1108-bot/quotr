-- ================================================================
-- Quotr — Unify one-off and recurring onto ONE line-item system
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
--   Removes the separate recurring line-item system that turned out to be
--   a mistake — recurring quotes now use the exact same "jobs.line_items"
--   column as one-off quotes (labour/material/fixed), priced by the exact
--   same engine. This drops the now-dead columns so the old system can't
--   quietly come back:
--     - jobs.recurring_line_items (checked: no real quote had data in it)
--     - rate_cards.day_rate, hours_per_day, weekend_surcharge_percent,
--       holiday_surcharge_percent, extra_work_hourly_rate — these were
--       only ever read by the old recurring pricing engine, which no
--       longer exists.
--
--   rate_cards.prices_shown_excluding_vat is KEPT — it's still used to
--   decide whether recurring quotes display ex-VAT or incl-VAT figures.
--
-- Destructive but scoped: only removes columns confirmed to hold no real
-- data (recurring_line_items) or read by no remaining code (the rate-card
-- fields above). Safe to run more than once.
-- ================================================================

alter table jobs drop column if exists recurring_line_items;

alter table rate_cards drop column if exists day_rate;
alter table rate_cards drop column if exists hours_per_day;
alter table rate_cards drop column if exists weekend_surcharge_percent;
alter table rate_cards drop column if exists holiday_surcharge_percent;
alter table rate_cards drop column if exists extra_work_hourly_rate;
