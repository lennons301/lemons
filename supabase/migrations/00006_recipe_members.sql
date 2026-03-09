-- Add date_of_birth to managed members
ALTER TABLE household_managed_members
  ADD COLUMN date_of_birth date;

-- Age category helper (STABLE because age() depends on current_date)
CREATE OR REPLACE FUNCTION public.age_category(dob date)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN dob IS NULL THEN NULL
    WHEN age(dob) < interval '1 year' THEN 'baby'
    WHEN age(dob) < interval '3 years' THEN 'toddler'
    WHEN age(dob) < interval '11 years' THEN 'child'
    ELSE 'teenager'
  END;
$$;

-- Unified person view across both member tables
CREATE OR REPLACE VIEW public.household_persons AS
  SELECT
    id,
    household_id,
    profile_id,
    display_name,
    NULL::date AS date_of_birth,
    'member'::text AS person_type
  FROM household_members
UNION ALL
  SELECT
    id,
    household_id,
    NULL::uuid AS profile_id,
    display_name,
    date_of_birth,
    'managed'::text AS person_type
  FROM household_managed_members;

-- Recipe-to-person join table
CREATE TABLE public.recipe_members (
  recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  person_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (recipe_id, person_id)
);

CREATE INDEX idx_recipe_members_person ON recipe_members(person_id);

-- RLS
ALTER TABLE recipe_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view recipe_members for their household recipes"
  ON recipe_members FOR SELECT
  USING (recipe_id IN (
    SELECT id FROM recipes WHERE household_id IN (SELECT public.get_my_household_ids())
  ));

CREATE POLICY "Users can insert recipe_members for their household recipes"
  ON recipe_members FOR INSERT
  WITH CHECK (recipe_id IN (
    SELECT id FROM recipes WHERE household_id IN (SELECT public.get_my_household_ids())
  ));

CREATE POLICY "Users can delete recipe_members for their household recipes"
  ON recipe_members FOR DELETE
  USING (recipe_id IN (
    SELECT id FROM recipes WHERE household_id IN (SELECT public.get_my_household_ids())
  ));
