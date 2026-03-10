-- Migration: 00012_inventory.sql
-- Inventory items and defaults tables for household inventory management

-- inventory_items: tracks what food is in the household
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  name text not null,
  display_name text not null,
  quantity numeric,
  unit text,
  location text not null check (location in ('fridge', 'freezer', 'pantry', 'cupboard', 'other')),
  category text check (category is null or category in ('produce', 'dairy', 'meat', 'fish', 'grain', 'tinned', 'spice', 'condiment', 'other')),
  expiry_date date,
  added_from text not null default 'manual' check (added_from in ('manual', 'shopping_list')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_inventory_items_household on public.inventory_items(household_id);
create index idx_inventory_items_household_name_location on public.inventory_items(household_id, name, location);

create trigger inventory_items_updated_at
  before update on public.inventory_items
  for each row execute function public.update_updated_at();

alter table public.inventory_items enable row level security;

create policy "household_read" on public.inventory_items
  for select using (household_id in (select public.get_my_household_ids()));

create policy "household_insert" on public.inventory_items
  for insert with check (household_id in (select public.get_my_household_ids()));

create policy "household_update" on public.inventory_items
  for update using (household_id in (select public.get_my_household_ids()));

create policy "household_delete" on public.inventory_items
  for delete using (household_id in (select public.get_my_household_ids()));

-- inventory_defaults: remembers location/category per item name per household
create table if not exists public.inventory_defaults (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  normalized_name text not null,
  location text not null check (location in ('fridge', 'freezer', 'pantry', 'cupboard', 'other')),
  category text check (category is null or category in ('produce', 'dairy', 'meat', 'fish', 'grain', 'tinned', 'spice', 'condiment', 'other')),
  constraint uq_inventory_defaults_household_name unique (household_id, normalized_name)
);

create index idx_inventory_defaults_household on public.inventory_defaults(household_id);

alter table public.inventory_defaults enable row level security;

create policy "household_read" on public.inventory_defaults
  for select using (household_id in (select public.get_my_household_ids()));

create policy "household_insert" on public.inventory_defaults
  for insert with check (household_id in (select public.get_my_household_ids()));

create policy "household_update" on public.inventory_defaults
  for update using (household_id in (select public.get_my_household_ids()));

create policy "household_delete" on public.inventory_defaults
  for delete using (household_id in (select public.get_my_household_ids()));

-- RPC function for transactional bulk inventory transfer from shopping
create or replace function public.inventory_bulk_transfer(
  p_household_id uuid,
  p_created_by uuid,
  p_items jsonb
) returns jsonb
language plpgsql
security definer
as $$
declare
  item jsonb;
  existing_record record;
  inserted_count int := 0;
  updated_count int := 0;
  skipped_count int := 0;
begin
  -- Verify caller is member of household
  if p_household_id not in (select public.get_my_household_ids()) then
    raise exception 'Not a member of this household';
  end if;

  for item in select * from jsonb_array_elements(p_items)
  loop
    -- Check for existing item with same name + location
    select id, quantity, unit into existing_record
    from public.inventory_items
    where household_id = p_household_id
      and name = item->>'name'
      and location = item->>'location'
    limit 1;

    if existing_record.id is not null and (item->>'quantity') is not null then
      -- Compatible unit or no existing unit → merge
      if existing_record.unit is null or (item->>'unit') is null or existing_record.unit = item->>'unit' then
        update public.inventory_items
        set quantity = coalesce(existing_record.quantity, 0) + (item->>'quantity')::numeric
        where id = existing_record.id;
        updated_count := updated_count + 1;
      else
        -- Different units → insert new row
        insert into public.inventory_items (household_id, created_by, name, display_name, quantity, unit, location, category, added_from)
        values (p_household_id, p_created_by, item->>'name', item->>'display_name', (item->>'quantity')::numeric, item->>'unit', item->>'location', item->>'category', 'shopping_list');
        inserted_count := inserted_count + 1;
      end if;
    elsif existing_record.id is not null then
      -- Match exists but no incoming quantity, skip
      skipped_count := skipped_count + 1;
    else
      -- No match → insert
      insert into public.inventory_items (household_id, created_by, name, display_name, quantity, unit, location, category, added_from)
      values (p_household_id, p_created_by, item->>'name', item->>'display_name', (item->>'quantity')::numeric, item->>'unit', item->>'location', item->>'category', 'shopping_list');
      inserted_count := inserted_count + 1;
    end if;

    -- Upsert default
    insert into public.inventory_defaults (household_id, normalized_name, location, category)
    values (p_household_id, item->>'name', item->>'location', item->>'category')
    on conflict (household_id, normalized_name)
    do update set location = excluded.location, category = excluded.category;
  end loop;

  return jsonb_build_object('inserted', inserted_count, 'updated', updated_count, 'skipped', skipped_count);
end;
$$;
