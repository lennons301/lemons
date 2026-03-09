-- Meal plan entries
create table if not exists public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  recipe_id uuid references public.recipes(id) on delete set null,
  custom_name text,
  servings integer not null default 1,
  assigned_to uuid[] not null default '{}',
  created_by uuid not null references public.profiles(id),
  status text not null default 'planned' check (status in ('planned', 'cooked', 'skipped')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_has_source check (recipe_id is not null or custom_name is not null)
);

create trigger meal_plan_entries_updated_at
  before update on public.meal_plan_entries
  for each row execute function public.update_updated_at();

-- Todo lists (shopping lists are list_type = 'shopping')
create table if not exists public.todo_lists (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  list_type text not null default 'general' check (list_type in ('general', 'shopping', 'checklist', 'project')),
  created_by uuid not null references public.profiles(id),
  color text,
  pinned boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Todo items (shopping items when parent list is shopping)
create table if not exists public.todo_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.todo_lists(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  priority text not null default 'none' check (priority in ('none', 'low', 'medium', 'high', 'urgent')),
  due_date date,
  assigned_to uuid,
  created_by uuid not null references public.profiles(id),
  sort_order integer not null default 0,
  parent_item_id uuid references public.todo_items(id) on delete cascade,
  recurrence_rule text,
  completed_at timestamptz,
  quantity numeric,
  unit text,
  tags jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger todo_items_updated_at
  before update on public.todo_items
  for each row execute function public.update_updated_at();

-- Household staples
create table if not exists public.household_staples (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  default_quantity numeric,
  default_unit text,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_meal_plan_entries_household_date on public.meal_plan_entries(household_id, date);
create index idx_meal_plan_entries_recipe on public.meal_plan_entries(recipe_id);
create index idx_todo_lists_household on public.todo_lists(household_id);
create index idx_todo_lists_type on public.todo_lists(list_type);
create index idx_todo_items_list on public.todo_items(list_id);
create index idx_todo_items_parent on public.todo_items(parent_item_id);
create index idx_todo_items_status on public.todo_items(status);
create index idx_household_staples_household on public.household_staples(household_id);

-- RLS: meal_plan_entries
alter table public.meal_plan_entries enable row level security;

create policy "household_read" on public.meal_plan_entries
  for select using (household_id in (select public.get_my_household_ids()));

create policy "household_insert" on public.meal_plan_entries
  for insert with check (household_id in (select public.get_my_household_ids()));

create policy "household_update" on public.meal_plan_entries
  for update using (household_id in (select public.get_my_household_ids()));

create policy "household_delete" on public.meal_plan_entries
  for delete using (household_id in (select public.get_my_household_ids()));

-- RLS: todo_lists
alter table public.todo_lists enable row level security;

create policy "household_read" on public.todo_lists
  for select using (household_id in (select public.get_my_household_ids()));

create policy "household_insert" on public.todo_lists
  for insert with check (household_id in (select public.get_my_household_ids()));

create policy "household_update" on public.todo_lists
  for update using (household_id in (select public.get_my_household_ids()));

create policy "household_delete" on public.todo_lists
  for delete using (household_id in (select public.get_my_household_ids()));

-- RLS: todo_items (cascade through todo_lists)
alter table public.todo_items enable row level security;

create policy "household_read" on public.todo_items
  for select using (list_id in (
    select id from public.todo_lists where household_id in (select public.get_my_household_ids())
  ));

create policy "household_insert" on public.todo_items
  for insert with check (list_id in (
    select id from public.todo_lists where household_id in (select public.get_my_household_ids())
  ));

create policy "household_update" on public.todo_items
  for update using (list_id in (
    select id from public.todo_lists where household_id in (select public.get_my_household_ids())
  ));

create policy "household_delete" on public.todo_items
  for delete using (list_id in (
    select id from public.todo_lists where household_id in (select public.get_my_household_ids())
  ));

-- RLS: household_staples
alter table public.household_staples enable row level security;

create policy "household_read" on public.household_staples
  for select using (household_id in (select public.get_my_household_ids()));

create policy "household_insert" on public.household_staples
  for insert with check (household_id in (select public.get_my_household_ids()));

create policy "household_update" on public.household_staples
  for update using (household_id in (select public.get_my_household_ids()));

create policy "household_delete" on public.household_staples
  for delete using (household_id in (select public.get_my_household_ids()));
