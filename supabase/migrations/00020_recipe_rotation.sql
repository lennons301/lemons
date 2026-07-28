-- Recipe rotation state (issue #46)
-- A household can take a recipe out of rotation — kept in the library and
-- fully usable, but flagged as not currently used for meal planning — and
-- return it later. Household-wide boolean; existing recipes default to true.

alter table public.recipes
  add column if not exists in_rotation boolean not null default true;
