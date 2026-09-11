-- Subscription plan tracking, so Mohitech can see which plan a restaurant is on, when it's
-- next due, and get reminded (in-app, not email -- see admin client / POS app changes) before
-- it lapses. Auto-disable reuses the existing `enabled` column and its existing enforcement in
-- POS/api's verifyPinAuth + /sync checkOnly -- no new gate needed here.
--
-- subscription_plan is nullable and is the master switch: a restaurant with no plan set is
-- completely excluded from all reminder/disable logic, so newly-registered or not-yet-billed
-- restaurants are never accidentally swept up by the daily cron.
ALTER TABLE restaurants ADD COLUMN subscription_plan TEXT
  CHECK (subscription_plan IS NULL OR subscription_plan IN ('quarterly', 'half_yearly', 'annual'));

-- The anchor date subscription cycles are computed from. Defaults to each restaurant's own
-- registration date (backfilled below) but is independently editable -- actual billing start
-- doesn't always match the moment a restaurant was first set up in the system.
ALTER TABLE restaurants ADD COLUMN subscription_start_date DATE;
UPDATE restaurants SET subscription_start_date = created_at::date WHERE subscription_start_date IS NULL;

-- Which billing cycle (1st, 2nd, 3rd, ...) is currently due, counted from
-- subscription_start_date. next_due_date is always recomputed as
-- addMonthsClamped(subscription_start_date, subscription_cycle_number * planMonths) --
-- NEVER by adding another plan period on top of the previous due date. Chaining off the
-- previous due date would let a clamped month (e.g. an anchor of the 31st landing on Feb 28)
-- permanently drag every future cycle down to day 28/30 instead of returning to 31 once the
-- month allows it again; always recomputing from the fixed anchor avoids that drift entirely.
ALTER TABLE restaurants ADD COLUMN subscription_cycle_number INTEGER NOT NULL DEFAULT 1;

-- The currently tracked due date -- addMonthsClamped(subscription_start_date,
-- subscription_cycle_number * planMonths). Recomputed whenever the plan/start date changes or
-- a payment is marked (which just increments subscription_cycle_number).
ALTER TABLE restaurants ADD COLUMN next_due_date DATE;

-- Bookkeeping only, shown in the admin UI.
ALTER TABLE restaurants ADD COLUMN last_payment_recorded_at TIMESTAMP WITH TIME ZONE;
