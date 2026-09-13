-- Whether the public site's Full Menu section lays out categories as a strict 2-column grid
-- ("vertical" -- the original, still-supported look) or a masonry-style multi-column flow
-- ("horizontal" -- categories pack to fill horizontal space instead of leaving gaps when
-- category lengths vary). Defaults to 'horizontal': Postgres backfills this default onto every
-- existing row when the column is added, so already-published sites get the improved layout
-- immediately without the admin having to configure anything.
ALTER TABLE restaurant_websites
  ADD COLUMN menu_layout TEXT NOT NULL DEFAULT 'horizontal'
    CHECK (menu_layout IN ('vertical', 'horizontal'));
