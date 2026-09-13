-- Optional decorative photo for the public site's "Full Menu" section.
--
-- Also closes a real layout gap: the menu section renders a fixed 2-column grid of category
-- cards, so a restaurant with an odd number of categories (the common case -- most start with
-- just one, e.g. "Starters") leaves an empty dark box in the last row. Uploading this photo
-- fills that slot with something intentional; page.tsx also makes the grid's last cell span
-- full-width whenever the child count is odd, so the empty box never appears even before a
-- photo is uploaded.
ALTER TABLE restaurant_websites ADD COLUMN menu_image_url TEXT;
