-- Which Mohitech pricing tier a restaurant is on (Starter/Growth/Pro), separate from
-- subscription_plan (which is the *billing cycle* -- quarterly/half_yearly/annual). Nullable:
-- a restaurant with no tier picked yet just shows as unset in the admin UI.
ALTER TABLE restaurants ADD COLUMN service_plan TEXT
  CHECK (service_plan IS NULL OR service_plan IN ('starter', 'growth', 'pro'));
