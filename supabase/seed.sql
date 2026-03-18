-- Seed data for local development
-- =================================
--
-- Workflow:
-- 1. Run `npx supabase db reset` to apply migrations and this seed file
-- 2. Create test users via the Supabase Auth UI at http://127.0.0.1:54323
--    or via the signup flow at http://localhost:3000/signup
-- 3. The on_auth_user_created trigger will auto-create profile rows
--
-- Once test users exist, you can add household seed data here using their IDs.
-- For now, all data is created through the app's UI during development.

-- ============================================================
-- SAMPLE RECIPES (requires a household to exist)
-- Run after creating a test user + household via the app.
-- These use a placeholder household_id and profile_id.
-- Replace with real IDs from your local dev environment.
-- ============================================================
--
-- To use:
-- 1. Sign up via the app at http://localhost:3000/signup
-- 2. Create a household via onboarding
-- 3. Find your profile ID and household ID in Supabase Studio (http://localhost:54323)
-- 4. Run: psql -h localhost -p 54322 -U postgres -d postgres < supabase/seed-recipes.sql
-- Or paste in Studio SQL editor after replacing the IDs below.
--
-- Example (uncomment and replace IDs):
-- INSERT INTO recipes (title, description, servings, prep_time, cook_time, instructions, household_id, created_by) VALUES
-- ('Chicken Tikka Masala', 'Classic British-Indian curry', 4, 20, 35, '["Marinate chicken in yoghurt and spices", "Grill or pan-fry chicken pieces", "Make sauce: fry onions, add tomatoes and cream", "Combine chicken with sauce and simmer"]'::jsonb, 'YOUR_HOUSEHOLD_ID', 'YOUR_PROFILE_ID'),
-- ('Spaghetti Bolognese', 'Simple family bolognese', 4, 10, 45, '["Fry onion, carrot, and celery", "Brown the mince", "Add tinned tomatoes and herbs", "Simmer for 30 minutes", "Cook spaghetti and serve"]'::jsonb, 'YOUR_HOUSEHOLD_ID', 'YOUR_PROFILE_ID');

-- Template: Packing list
INSERT INTO todo_lists (id, household_id, title, list_type, is_template, created_by)
VALUES ('00000000-0000-0000-0000-000000000901', (SELECT id FROM households LIMIT 1), 'Holiday Packing', 'checklist', true, (SELECT id FROM profiles LIMIT 1));

INSERT INTO todo_items (list_id, title, group_name, sort_order, created_by) VALUES
  ('00000000-0000-0000-0000-000000000901', 'T-shirts', 'Clothes', 0, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000901', 'Shorts', 'Clothes', 1, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000901', 'Swimwear', 'Clothes', 2, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000901', 'Toothbrush', 'Toiletries', 3, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000901', 'Sunscreen', 'Toiletries', 4, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000901', 'Phone charger', 'Electronics', 5, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000901', 'Headphones', 'Electronics', 6, (SELECT id FROM profiles LIMIT 1));

-- Template: Weekly chores
INSERT INTO todo_lists (id, household_id, title, list_type, is_template, created_by)
VALUES ('00000000-0000-0000-0000-000000000902', (SELECT id FROM households LIMIT 1), 'Weekly Chores', 'general', true, (SELECT id FROM profiles LIMIT 1));

INSERT INTO todo_items (list_id, title, sort_order, created_by) VALUES
  ('00000000-0000-0000-0000-000000000902', 'Vacuum downstairs', 0, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000902', 'Clean bathrooms', 1, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000902', 'Mop kitchen', 2, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000902', 'Change bedsheets', 3, (SELECT id FROM profiles LIMIT 1));

-- Event-linked list (linked to first calendar event)
INSERT INTO todo_lists (id, household_id, title, list_type, event_id, created_by)
VALUES ('00000000-0000-0000-0000-000000000903', (SELECT id FROM households LIMIT 1), 'Trip Prep', 'checklist',
  (SELECT id FROM calendar_events LIMIT 1), (SELECT id FROM profiles LIMIT 1));

INSERT INTO todo_items (list_id, title, sort_order, status, created_by) VALUES
  ('00000000-0000-0000-0000-000000000903', 'Book hotel', 0, 'completed', (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000903', 'Pack bags', 1, 'pending', (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000903', 'Arrange pet sitter', 2, 'pending', (SELECT id FROM profiles LIMIT 1));
