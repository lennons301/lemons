-- Make recipe-images bucket public so images can be served via public URLs.
-- Recipe images are not sensitive — they're photos of food.
UPDATE storage.buckets SET public = true WHERE id = 'recipe-images';
