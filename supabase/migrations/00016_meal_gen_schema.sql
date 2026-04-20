-- 00016_meal_gen_schema.sql
-- Adds: meal_gen_conversations, meal_gen_drafts, packet_sizes tables.
-- Adds columns: meal_plan_entries.{custom_ingredients, inventory_item_id}, todo_items.metadata.

-- ============================================================
-- meal_gen_conversations
-- ============================================================
create table if not exists public.meal_gen_conversations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  week_start date not null,
  messages jsonb not null default '[]'::jsonb,
  status text not null default 'active' check (status in ('active', 'accepted', 'abandoned')),
  accepted_at timestamptz,
  last_activity_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_meal_gen_conversations_household on public.meal_gen_conversations(household_id);
create index idx_meal_gen_conversations_status on public.meal_gen_conversations(status);
create index idx_meal_gen_conversations_last_activity on public.meal_gen_conversations(last_activity_at) where status = 'active';

-- ============================================================
-- meal_gen_drafts
-- ============================================================
create table if not exists public.meal_gen_drafts (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.meal_gen_conversations(id) on delete cascade,
  date date not null,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  source text not null check (source in ('recipe', 'custom', 'custom_with_ingredients', 'leftover')),
  recipe_id uuid references public.recipes(id) on delete set null,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  custom_name text,
  custom_ingredients jsonb,
  servings integer not null default 1,
  assigned_to uuid[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  constraint meal_gen_drafts_unique_slot unique (conversation_id, date, meal_type),
  constraint meal_gen_drafts_source_invariant check (
    (source = 'recipe'
       and recipe_id is not null and inventory_item_id is null and custom_name is null and custom_ingredients is null)
    or (source = 'leftover'
       and inventory_item_id is not null and recipe_id is null and custom_name is null and custom_ingredients is null)
    or (source = 'custom'
       and custom_name is not null and recipe_id is null and inventory_item_id is null and custom_ingredients is null)
    or (source = 'custom_with_ingredients'
       and custom_name is not null and custom_ingredients is not null and recipe_id is null and inventory_item_id is null)
  )
);

create index idx_meal_gen_drafts_conversation on public.meal_gen_drafts(conversation_id);

-- ============================================================
-- packet_sizes
-- ============================================================
create table if not exists public.packet_sizes (
  id uuid primary key default gen_random_uuid(),
  ingredient_name text not null,
  pack_quantity numeric not null,
  pack_unit text not null,
  locale text not null default 'UK',
  is_default boolean not null default true,
  household_id uuid references public.households(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now()
);

create index idx_packet_sizes_name on public.packet_sizes(ingredient_name);
create index idx_packet_sizes_household on public.packet_sizes(household_id);
-- Multiple pack sizes per ingredient are allowed; only one is_default per ingredient per scope.
create unique index idx_packet_sizes_one_default_global
  on public.packet_sizes(ingredient_name, locale)
  where household_id is null and is_default = true;
create unique index idx_packet_sizes_one_default_household
  on public.packet_sizes(ingredient_name, locale, household_id)
  where household_id is not null and is_default = true;

-- ============================================================
-- meal_plan_entries: new columns
-- ============================================================
alter table public.meal_plan_entries
  add column if not exists custom_ingredients jsonb,
  add column if not exists inventory_item_id uuid references public.inventory_items(id) on delete set null;

create index if not exists idx_meal_plan_entries_inventory_item on public.meal_plan_entries(inventory_item_id);

-- ============================================================
-- todo_items: new column
-- ============================================================
alter table public.todo_items
  add column if not exists metadata jsonb;

-- ============================================================
-- RLS: meal_gen_conversations
-- ============================================================
alter table public.meal_gen_conversations enable row level security;

create policy "household_read" on public.meal_gen_conversations
  for select using (household_id in (select public.get_my_household_ids()));

create policy "household_insert" on public.meal_gen_conversations
  for insert with check (household_id in (select public.get_my_household_ids()));

create policy "household_update" on public.meal_gen_conversations
  for update using (household_id in (select public.get_my_household_ids()));

create policy "household_delete" on public.meal_gen_conversations
  for delete using (household_id in (select public.get_my_household_ids()));

-- ============================================================
-- RLS: meal_gen_drafts (cascade through conversation)
-- ============================================================
alter table public.meal_gen_drafts enable row level security;

create policy "household_read" on public.meal_gen_drafts
  for select using (conversation_id in (
    select id from public.meal_gen_conversations where household_id in (select public.get_my_household_ids())
  ));

create policy "household_insert" on public.meal_gen_drafts
  for insert with check (conversation_id in (
    select id from public.meal_gen_conversations where household_id in (select public.get_my_household_ids())
  ));

create policy "household_update" on public.meal_gen_drafts
  for update using (conversation_id in (
    select id from public.meal_gen_conversations where household_id in (select public.get_my_household_ids())
  ));

create policy "household_delete" on public.meal_gen_drafts
  for delete using (conversation_id in (
    select id from public.meal_gen_conversations where household_id in (select public.get_my_household_ids())
  ));

-- ============================================================
-- RLS: packet_sizes
-- Global rows (household_id is null) are readable by all authenticated users.
-- Household overrides follow normal household_id rules.
-- Writes to global rows happen via migrations only (no policy permits them).
-- ============================================================
alter table public.packet_sizes enable row level security;

create policy "global_or_household_read" on public.packet_sizes
  for select using (
    household_id is null
    or household_id in (select public.get_my_household_ids())
  );

create policy "household_insert" on public.packet_sizes
  for insert with check (
    household_id is not null
    and household_id in (select public.get_my_household_ids())
  );

create policy "household_update" on public.packet_sizes
  for update using (
    household_id is not null
    and household_id in (select public.get_my_household_ids())
  );

create policy "household_delete" on public.packet_sizes
  for delete using (
    household_id is not null
    and household_id in (select public.get_my_household_ids())
  );
