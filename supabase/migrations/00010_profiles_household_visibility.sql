-- Allow users to see profiles of people in their households.
-- Without this, the profiles join on household_members returns null
-- for other members due to RLS.
CREATE POLICY "Users can read profiles of household members"
  ON public.profiles FOR SELECT
  USING (
    id IN (
      SELECT hm.profile_id
      FROM public.household_members hm
      WHERE hm.household_id IN (SELECT public.get_my_household_ids())
    )
  );
