-- Templated one-pager website for Plan-1 POS clients.
--
-- Deliberately kept Supabase-only, in brand-new tables: the POS mobile app's local
-- SQLite/sync/restore pipeline never needs to know these exist. Neither table is added to
-- api/src/index.ts's TABLE_MAP, so the mobile app's push-sync never touches them, and
-- setupService.ts's restoreFromCloud() never needs to pull them down either. Both new tables
-- are read/written exclusively by the admin panel server and the public site renderer, both of
-- which hold the Supabase service-role key (bypasses RLS) the same way api/src/index.ts does.

CREATE TABLE restaurant_websites (
  restaurant_id TEXT PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  theme_color TEXT NOT NULL DEFAULT '#c0392b',
  tagline TEXT,
  description TEXT,
  hours_text TEXT,
  address_override TEXT,
  phone_override TEXT,
  social_instagram_url TEXT,
  social_facebook_url TEXT,
  social_maps_url TEXT,
  hero_image_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- menu_item_id is the primary key (one dish, one photo) rather than a separate id + FK.
-- restaurant_id is denormalized onto it -- matching schema.sql's existing convention of
-- stamping restaurant_id onto every synced table, even junction tables, "for RLS/isolation
-- defense-in-depth" -- so the public read query never needs to join through menu_items just to
-- scope by restaurant.
CREATE TABLE menu_item_website_media (
  menu_item_id TEXT PRIMARY KEY REFERENCES menu_items(id) ON DELETE CASCADE,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  image_url TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_menu_item_website_media_restaurant ON menu_item_website_media(restaurant_id);

ALTER TABLE restaurant_websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_website_media ENABLE ROW LEVEL SECURITY;
-- No policies added, matching every other table in schema.sql: default-deny for the anon key.
-- The admin panel server and the public site renderer both read/write via the service-role key,
-- which bypasses RLS entirely -- same pattern api/src/index.ts already uses for every other table.

-- Reuses the trigger function already defined in schema.sql -- do not redefine it here.
CREATE TRIGGER update_restaurant_websites_updated_at BEFORE UPDATE ON restaurant_websites
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_menu_item_website_media_updated_at BEFORE UPDATE ON menu_item_website_media
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- STORAGE BUCKET
-- ============================================================================
-- Public-read bucket for hero/dish photos. This is a SEPARATE gate from the table RLS above --
-- browsers and social-crawler Open Graph image fetches hit this bucket's public URL directly,
-- bypassing the admin/public-site API entirely, so it needs its own explicit public-read policy
-- even though the tables above stay default-deny. Path convention (enforced by the uploading
-- code, not by Postgres): {restaurant_id}/hero.jpg and {restaurant_id}/menu/{menu_item_id}.jpg --
-- deterministic paths so a re-upload just overwrites the same object, no orphan cleanup needed.

INSERT INTO storage.buckets (id, name, public)
VALUES ('restaurant-website-media', 'restaurant-website-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read access for restaurant website media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'restaurant-website-media');

-- Writes to the bucket only ever come from the admin panel server, which uses the service-role
-- key (bypasses storage RLS too) -- no INSERT/UPDATE policy needed for the anon key.
