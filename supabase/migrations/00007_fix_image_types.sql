-- Expand recipe_images type constraint to include 'hero' and 'source'
-- Frontend uses these types but the original constraint only allowed
-- 'photo', 'screenshot', 'ai_source', causing silent insert failures.
ALTER TABLE recipe_images
  DROP CONSTRAINT IF EXISTS recipe_images_type_check;

ALTER TABLE recipe_images
  ADD CONSTRAINT recipe_images_type_check
  CHECK (type IN ('photo', 'screenshot', 'ai_source', 'hero', 'source'));
