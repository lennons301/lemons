-- Repair migration: adds helper functions and fixes RLS policies
-- that were missing from the initial production push of 00001.
--
-- The 00001 migration was edited locally (commit eb79e9a) after
-- it had already been pushed to production, so production has the
-- old self-referencing RLS policies that cause infinite recursion.

-- ============================================================
-- HELPERS: security definer functions to get current user's household IDs
-- without triggering RLS on household_members (avoids infinite recursion)
-- ============================================================
create or replace function public.get_my_household_ids()
returns setof uuid as $$
  select household_id from public.household_members
  where profile_id = auth.uid()
$$ language sql security definer stable;

create or replace function public.get_my_admin_household_ids()
returns setof uuid as $$
  select household_id from public.household_members
  where profile_id = auth.uid() and role = 'admin'
$$ language sql security definer stable;

-- ============================================================
-- DROP old self-referencing policies and recreate with helper functions
-- ============================================================

-- Households: fix "Members can view their households"
drop policy if exists "Members can view their households" on public.households;
create policy "Members can view their households"
  on public.households for select
  using (
    created_by = auth.uid()
    or id in (
      select household_id from public.household_members
      where profile_id = auth.uid()
    )
  );

-- Households: fix "Admins can update their households"
drop policy if exists "Admins can update their households" on public.households;
create policy "Admins can update their households"
  on public.households for update
  using (
    id in (select public.get_my_admin_household_ids())
  );

-- Household Members: fix all policies
drop policy if exists "Members can view co-members" on public.household_members;
create policy "Members can view co-members"
  on public.household_members for select
  using (household_id in (select public.get_my_household_ids()));

drop policy if exists "Admins can insert members" on public.household_members;
create policy "Admins can insert members"
  on public.household_members for insert
  with check (
    profile_id = auth.uid()
    or household_id in (select public.get_my_admin_household_ids())
  );

drop policy if exists "Admins can update members" on public.household_members;
create policy "Admins can update members"
  on public.household_members for update
  using (
    household_id in (select public.get_my_admin_household_ids())
  );

drop policy if exists "Admins can remove members" on public.household_members;
create policy "Admins can remove members"
  on public.household_members for delete
  using (
    household_id in (select public.get_my_admin_household_ids())
    or profile_id = auth.uid()
  );

-- Household Managed Members: fix policy
drop policy if exists "household_isolation" on public.household_managed_members;
create policy "household_isolation"
  on public.household_managed_members for all
  using (household_id in (select public.get_my_household_ids()));

-- Household Invites: fix policy
drop policy if exists "Admins can manage invites" on public.household_invites;
create policy "Admins can manage invites"
  on public.household_invites for all
  using (household_id in (select public.get_my_admin_household_ids()));
