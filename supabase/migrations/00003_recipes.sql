-- ============================================================
-- RECIPES TABLES
-- ============================================================

-- RECIPES
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  servings integer not null default 4,
  prep_time integer, -- minutes
  cook_time integer, -- minutes
  instructions jsonb not null default '[]'::jsonb, -- array of step strings
  source_url text,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- RECIPE INGREDIENTS
create table if not exists public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  raw_text text not null, -- "2 large onions, diced"
  quantity numeric, -- 2
  unit text, -- normalized unit
  name text, -- normalized, singular ("onion")
  "group" text, -- "For the sauce"
  optional boolean not null default false,
  notes text, -- "diced"
  sort_order integer not null default 0
);

-- RECIPE TAGS
create table if not exists public.recipe_tags (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  tag_name text not null, -- lowercase, trimmed
  unique(recipe_id, tag_name)
);

-- RECIPE IMAGES
create table if not exists public.recipe_images (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  url text not null, -- Supabase Storage URL
  type text not null default 'photo' check (type in ('photo', 'screenshot', 'ai_source')),
  sort_order integer not null default 0
);

-- Updated_at trigger for recipes
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger recipes_updated_at
  before update on public.recipes
  for each row execute function public.update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_tags enable row level security;
alter table public.recipe_images enable row level security;

-- Recipes: household members can read, members can create, creator/admin can update/delete
create policy "household_read" on public.recipes
  for select using (household_id in (select public.get_my_household_ids()));

create policy "household_insert" on public.recipes
  for insert with check (household_id in (select public.get_my_household_ids()));

create policy "household_update" on public.recipes
  for update using (household_id in (select public.get_my_household_ids()));

create policy "household_delete" on public.recipes
  for delete using (household_id in (select public.get_my_household_ids()));

-- Recipe ingredients: same as parent recipe (cascade through household_id via recipe)
create policy "household_read" on public.recipe_ingredients
  for select using (recipe_id in (
    select id from public.recipes where household_id in (select public.get_my_household_ids())
  ));

create policy "household_insert" on public.recipe_ingredients
  for insert with check (recipe_id in (
    select id from public.recipes where household_id in (select public.get_my_household_ids())
  ));

create policy "household_update" on public.recipe_ingredients
  for update using (recipe_id in (
    select id from public.recipes where household_id in (select public.get_my_household_ids())
  ));

create policy "household_delete" on public.recipe_ingredients
  for delete using (recipe_id in (
    select id from public.recipes where household_id in (select public.get_my_household_ids())
  ));

-- Recipe tags: same pattern
create policy "household_read" on public.recipe_tags
  for select using (recipe_id in (
    select id from public.recipes where household_id in (select public.get_my_household_ids())
  ));

create policy "household_insert" on public.recipe_tags
  for insert with check (recipe_id in (
    select id from public.recipes where household_id in (select public.get_my_household_ids())
  ));

create policy "household_update" on public.recipe_tags
  for update using (recipe_id in (
    select id from public.recipes where household_id in (select public.get_my_household_ids())
  ));

create policy "household_delete" on public.recipe_tags
  for delete using (recipe_id in (
    select id from public.recipes where household_id in (select public.get_my_household_ids())
  ));

-- Recipe images: same pattern
create policy "household_read" on public.recipe_images
  for select using (recipe_id in (
    select id from public.recipes where household_id in (select public.get_my_household_ids())
  ));

create policy "household_insert" on public.recipe_images
  for insert with check (recipe_id in (
    select id from public.recipes where household_id in (select public.get_my_household_ids())
  ));

create policy "household_update" on public.recipe_images
  for update using (recipe_id in (
    select id from public.recipes where household_id in (select public.get_my_household_ids())
  ));

create policy "household_delete" on public.recipe_images
  for delete using (recipe_id in (
    select id from public.recipes where household_id in (select public.get_my_household_ids())
  ));

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_recipes_household on public.recipes(household_id);
create index idx_recipes_created_by on public.recipes(created_by);
create index idx_recipe_ingredients_recipe on public.recipe_ingredients(recipe_id);
create index idx_recipe_ingredients_name on public.recipe_ingredients(name);
create index idx_recipe_tags_recipe on public.recipe_tags(recipe_id);
create index idx_recipe_tags_name on public.recipe_tags(tag_name);
create index idx_recipe_images_recipe on public.recipe_images(recipe_id);

-- ============================================================
-- STORAGE BUCKET
-- ============================================================

insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', false)
on conflict (id) do nothing;

-- Storage policies: household members can manage their recipe images
create policy "Household members can upload recipe images"
  on storage.objects for insert
  with check (
    bucket_id = 'recipe-images'
    and auth.uid() is not null
  );

create policy "Household members can view recipe images"
  on storage.objects for select
  using (
    bucket_id = 'recipe-images'
    and auth.uid() is not null
  );

create policy "Household members can delete recipe images"
  on storage.objects for delete
  using (
    bucket_id = 'recipe-images'
    and auth.uid() is not null
  );
