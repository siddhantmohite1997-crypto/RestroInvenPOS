-- Lets a restaurant's public website show a curated subset of its menu (a marketing page, not
-- a full digital menu dump) instead of always rendering every active category and item with
-- prices. All three are nullable/default-permissive so an existing published site's behavior is
-- unchanged until the admin explicitly narrows it:
--   menu_category_ids  NULL = show every category (current behavior); otherwise only these ids.
--   menu_item_limit     NULL = show every item in each shown category; otherwise cap per category.
--   menu_show_prices    defaults TRUE (current behavior).
ALTER TABLE restaurant_websites
  ADD COLUMN menu_category_ids TEXT[],
  ADD COLUMN menu_item_limit INTEGER,
  ADD COLUMN menu_show_prices BOOLEAN NOT NULL DEFAULT TRUE;
