-- Fix household_persons view to fall back to profile display_name/email
-- when household_members.display_name is null.
CREATE OR REPLACE VIEW public.household_persons AS
  SELECT
    hm.id,
    hm.household_id,
    hm.profile_id,
    COALESCE(hm.display_name, p.display_name, p.email) AS display_name,
    NULL::date AS date_of_birth,
    'member'::text AS person_type
  FROM household_members hm
  LEFT JOIN profiles p ON p.id = hm.profile_id
UNION ALL
  SELECT
    id,
    household_id,
    NULL::uuid AS profile_id,
    display_name,
    date_of_birth,
    'managed'::text AS person_type
  FROM household_managed_members;
