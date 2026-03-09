# Meal Planning + Shopping Lists Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build meal planning with a weekly grid, per-person assignment, and shopping list generation from meal plans with unit conversion and household staples.

**Architecture:** Flat meal plan entries (no plan entity) queried by household + date range. Shopping lists reuse the todo_lists/todo_items tables with `list_type = 'shopping'`. A static unit conversion table in `lib/utils/` handles metric/imperial aggregation during shopping list generation. Household staples auto-merge into generated shopping drafts.

**Tech Stack:** Next.js API routes, Supabase (PostgreSQL + RLS), Vitest, React Testing Library, shadcn/ui, Tailwind CSS

**Existing code to reference:**
- API route pattern: `src/app/api/recipes/route.ts`
- Migration pattern: `supabase/migrations/00003_recipes.sql`
- Page pattern: `src/app/(dashboard)/recipes/page.tsx`
- Component pattern: `src/components/features/recipe-form.tsx`
- Test pattern: `src/lib/utils/units.test.ts`
- Unit conversion: `src/lib/utils/units.ts` (already has `normalizeUnit`, `convertUnit`, `UNIT_TO_BASE`)
- Scaling: `src/lib/utils/scaling.ts`
- Supabase server client: `src/lib/supabase/server.ts`
- Types: `src/types/database.ts` (auto-generated, will need regeneration after migration)

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00007_meal_plans_and_todos.sql`

**Step 1: Write the migration**

```sql
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
```

**Step 2: Apply migration locally**

Run: `npx supabase db reset` (if local Supabase is running) or note for manual application.

**Step 3: Regenerate types**

Run: `npx supabase gen types typescript --local > src/types/database.ts`

Note: If local Docker/Supabase is not available (WSL2), manually add the type definitions for the new tables to `src/types/database.ts` following the existing pattern.

**Step 4: Commit**

```bash
git add supabase/migrations/00007_meal_plans_and_todos.sql src/types/database.ts
git commit -m "feat: add meal_plan_entries, todo_lists, todo_items, household_staples tables"
```

---

## Task 2: Shopping List Aggregation Utility

This utility collects recipe ingredients from meal plan entries, scales them, and aggregates by normalized name with unit conversion.

**Files:**
- Create: `src/lib/utils/aggregate-ingredients.ts`
- Create: `src/lib/utils/aggregate-ingredients.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest'
import { aggregateIngredients, type MealPlanIngredient } from './aggregate-ingredients'

describe('aggregateIngredients', () => {
  it('sums same ingredient with same unit', () => {
    const items: MealPlanIngredient[] = [
      { name: 'onion', quantity: 2, unit: 'unit', servings: 4, recipeServings: 4 },
      { name: 'onion', quantity: 3, unit: 'unit', servings: 4, recipeServings: 4 },
    ]
    const result = aggregateIngredients(items)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('onion')
    expect(result[0].quantity).toBe(5)
    expect(result[0].unit).toBe('unit')
  })

  it('scales by servings before aggregating', () => {
    const items: MealPlanIngredient[] = [
      { name: 'flour', quantity: 200, unit: 'g', servings: 8, recipeServings: 4 },
    ]
    const result = aggregateIngredients(items)
    expect(result[0].quantity).toBe(400)
  })

  it('converts compatible units before summing', () => {
    const items: MealPlanIngredient[] = [
      { name: 'flour', quantity: 2, unit: 'cup', servings: 4, recipeServings: 4 },
      { name: 'flour', quantity: 100, unit: 'g', servings: 4, recipeServings: 4 },
    ]
    const result = aggregateIngredients(items)
    // cup is volume, g is weight — incompatible, so separate lines
    expect(result).toHaveLength(2)
  })

  it('converts ml and cup into common unit', () => {
    const items: MealPlanIngredient[] = [
      { name: 'milk', quantity: 1, unit: 'cup', servings: 4, recipeServings: 4 },
      { name: 'milk', quantity: 500, unit: 'ml', servings: 4, recipeServings: 4 },
    ]
    const result = aggregateIngredients(items)
    expect(result).toHaveLength(1)
    // 1 cup = 236.588ml, total ≈ 736.588ml — presented in ml
    expect(result[0].unit).toBe('millilitre')
    expect(result[0].quantity).toBeCloseTo(736.588, 0)
  })

  it('converts tsp and tbsp', () => {
    const items: MealPlanIngredient[] = [
      { name: 'salt', quantity: 3, unit: 'tsp', servings: 4, recipeServings: 4 },
      { name: 'salt', quantity: 1, unit: 'tbsp', servings: 4, recipeServings: 4 },
    ]
    const result = aggregateIngredients(items)
    expect(result).toHaveLength(1)
    // 3 tsp ≈ 14.79ml, 1 tbsp ≈ 14.79ml, total ≈ 29.57ml
    expect(result[0].unit).toBe('millilitre')
    expect(result[0].quantity).toBeCloseTo(29.57, 0)
  })

  it('converts g and kg', () => {
    const items: MealPlanIngredient[] = [
      { name: 'chicken', quantity: 500, unit: 'g', servings: 4, recipeServings: 4 },
      { name: 'chicken', quantity: 1, unit: 'kg', servings: 4, recipeServings: 4 },
    ]
    const result = aggregateIngredients(items)
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBeCloseTo(1500, 0)
    expect(result[0].unit).toBe('gram')
  })

  it('keeps items with no quantity as-is', () => {
    const items: MealPlanIngredient[] = [
      { name: 'salt', quantity: null, unit: null, servings: 4, recipeServings: 4 },
      { name: 'salt', quantity: null, unit: null, servings: 2, recipeServings: 2 },
    ]
    const result = aggregateIngredients(items)
    // Can't sum null quantities — keep one entry
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBeNull()
  })

  it('keeps items with unknown units separate', () => {
    const items: MealPlanIngredient[] = [
      { name: 'basil', quantity: 1, unit: 'bunch', servings: 4, recipeServings: 4 },
      { name: 'basil', quantity: 2, unit: 'bunch', servings: 4, recipeServings: 4 },
    ]
    const result = aggregateIngredients(items)
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(3)
    expect(result[0].unit).toBe('bunch')
  })

  it('handles empty input', () => {
    expect(aggregateIngredients([])).toEqual([])
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npm run test:run -- src/lib/utils/aggregate-ingredients.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
import { normalizeUnit, convertUnit, UNIT_TO_BASE } from './units'
import { scaleQuantity } from './scaling'

export interface MealPlanIngredient {
  name: string
  quantity: number | null
  unit: string | null
  servings: number       // desired servings from meal plan entry
  recipeServings: number // base servings from recipe
}

export interface AggregatedItem {
  name: string
  quantity: number | null
  unit: string | null
}

export function aggregateIngredients(items: MealPlanIngredient[]): AggregatedItem[] {
  if (items.length === 0) return []

  // Scale each item first
  const scaled = items.map((item) => ({
    name: item.name,
    quantity: scaleQuantity(item.quantity, item.recipeServings, item.servings),
    unit: item.unit ? normalizeUnit(item.unit) : null,
  }))

  // Group by normalized name
  const groups = new Map<string, typeof scaled>()
  for (const item of scaled) {
    const key = item.name.toLowerCase()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }

  const result: AggregatedItem[] = []

  for (const [name, group] of groups) {
    // Separate items with null quantity
    const withQty = group.filter((g) => g.quantity !== null)
    const withoutQty = group.filter((g) => g.quantity === null)

    if (withQty.length === 0) {
      // All null quantity — keep one entry
      result.push({ name, quantity: null, unit: group[0].unit })
      continue
    }

    // Sub-group by unit compatibility (same UNIT_TO_BASE group)
    const unitBuckets = new Map<string, { quantity: number; unit: string }[]>()

    for (const item of withQty) {
      const unitInfo = item.unit ? UNIT_TO_BASE[item.unit] : null
      const bucketKey = unitInfo ? unitInfo.group : (item.unit || '__none__')

      if (!unitBuckets.has(bucketKey)) unitBuckets.set(bucketKey, [])
      unitBuckets.get(bucketKey)!.push({
        quantity: item.quantity!,
        unit: item.unit || '',
      })
    }

    for (const [bucketKey, bucket] of unitBuckets) {
      if (bucket.length === 1) {
        result.push({ name, quantity: bucket[0].quantity, unit: bucket[0].unit || null })
        continue
      }

      // Check if all units are the same
      const allSameUnit = bucket.every((b) => b.unit === bucket[0].unit)
      if (allSameUnit) {
        const total = bucket.reduce((sum, b) => sum + b.quantity, 0)
        result.push({ name, quantity: Math.round(total * 100) / 100, unit: bucket[0].unit || null })
        continue
      }

      // Convert all to base unit (ml for volume, g for weight)
      const baseUnit = bucketKey === 'volume' ? 'millilitre' : bucketKey === 'weight' ? 'gram' : null
      if (baseUnit) {
        let total = 0
        for (const b of bucket) {
          const converted = convertUnit(b.quantity, b.unit, baseUnit)
          if (converted !== null) {
            total += converted
          }
        }
        result.push({ name, quantity: Math.round(total * 100) / 100, unit: baseUnit })
      } else {
        // Unknown unit group — keep separate
        for (const b of bucket) {
          result.push({ name, quantity: b.quantity, unit: b.unit || null })
        }
      }
    }

    // Add null-quantity entries if any
    if (withoutQty.length > 0) {
      result.push({ name, quantity: null, unit: withoutQty[0].unit })
    }
  }

  return result
}
```

**Step 4: Export UNIT_TO_BASE from units.ts**

The `UNIT_TO_BASE` constant in `src/lib/utils/units.ts` is currently not exported. Add `export` to its declaration.

**Step 5: Run tests to verify they pass**

Run: `npm run test:run -- src/lib/utils/aggregate-ingredients.test.ts`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add src/lib/utils/aggregate-ingredients.ts src/lib/utils/aggregate-ingredients.test.ts src/lib/utils/units.ts
git commit -m "feat: add ingredient aggregation with unit conversion for shopping list generation"
```

---

## Task 3: Meal Plan API Routes

**Files:**
- Create: `src/app/api/meal-plans/route.ts` (GET list, POST create)
- Create: `src/app/api/meal-plans/[id]/route.ts` (PATCH update, DELETE)
- Create: `src/app/api/meal-plans/copy-week/route.ts` (POST copy)

**Step 1: Write GET /api/meal-plans and POST /api/meal-plans**

`src/app/api/meal-plans/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const householdId = searchParams.get('householdId')
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  if (!householdId || !from || !to) {
    return NextResponse.json({ error: 'householdId, from, and to are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('meal_plan_entries')
    .select(`
      *,
      recipes(id, title, servings, recipe_images(id, url, type, sort_order))
    `)
    .eq('household_id', householdId)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })
    .order('meal_type', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { household_id, date, meal_type, recipe_id, custom_name, servings, assigned_to, notes } = body

  if (!household_id || !date || !meal_type) {
    return NextResponse.json({ error: 'household_id, date, and meal_type are required' }, { status: 400 })
  }
  if (!recipe_id && !custom_name) {
    return NextResponse.json({ error: 'Either recipe_id or custom_name is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('meal_plan_entries')
    .insert({
      household_id,
      date,
      meal_type,
      recipe_id: recipe_id || null,
      custom_name: custom_name || null,
      servings: servings || 1,
      assigned_to: assigned_to || [],
      created_by: user.id,
      notes: notes || null,
    })
    .select(`
      *,
      recipes(id, title, servings, recipe_images(id, url, type, sort_order))
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

**Step 2: Write PATCH and DELETE for /api/meal-plans/[id]**

`src/app/api/meal-plans/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  // Only include fields that are present in the body
  if ('date' in body) updates.date = body.date
  if ('meal_type' in body) updates.meal_type = body.meal_type
  if ('recipe_id' in body) updates.recipe_id = body.recipe_id || null
  if ('custom_name' in body) updates.custom_name = body.custom_name || null
  if ('servings' in body) updates.servings = body.servings
  if ('assigned_to' in body) updates.assigned_to = body.assigned_to
  if ('status' in body) updates.status = body.status
  if ('notes' in body) updates.notes = body.notes || null

  const { data, error } = await supabase
    .from('meal_plan_entries')
    .update(updates)
    .eq('id', id)
    .select(`
      *,
      recipes(id, title, servings, recipe_images(id, url, type, sort_order))
    `)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('meal_plan_entries').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

**Step 3: Write POST /api/meal-plans/copy-week**

`src/app/api/meal-plans/copy-week/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { household_id, sourceWeekStart, targetWeekStart } = await request.json()

  if (!household_id || !sourceWeekStart || !targetWeekStart) {
    return NextResponse.json(
      { error: 'household_id, sourceWeekStart, and targetWeekStart are required' },
      { status: 400 }
    )
  }

  // Calculate source week end (7 days from start)
  const sourceStart = new Date(sourceWeekStart)
  const sourceEnd = new Date(sourceStart)
  sourceEnd.setDate(sourceEnd.getDate() + 6)

  // Fetch source week entries
  const { data: sourceEntries, error: fetchError } = await supabase
    .from('meal_plan_entries')
    .select('*')
    .eq('household_id', household_id)
    .gte('date', sourceWeekStart)
    .lte('date', sourceEnd.toISOString().split('T')[0])

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 })
  if (!sourceEntries || sourceEntries.length === 0) {
    return NextResponse.json({ error: 'No entries in source week' }, { status: 400 })
  }

  // Map entries to target week (same day offset)
  const targetStart = new Date(targetWeekStart)
  const newEntries = sourceEntries.map((entry) => {
    const entryDate = new Date(entry.date)
    const dayOffset = Math.round(
      (entryDate.getTime() - sourceStart.getTime()) / (1000 * 60 * 60 * 24)
    )
    const targetDate = new Date(targetStart)
    targetDate.setDate(targetDate.getDate() + dayOffset)

    return {
      household_id: entry.household_id,
      date: targetDate.toISOString().split('T')[0],
      meal_type: entry.meal_type,
      recipe_id: entry.recipe_id,
      custom_name: entry.custom_name,
      servings: entry.servings,
      assigned_to: entry.assigned_to,
      created_by: user.id,
      notes: entry.notes,
    }
  })

  const { data, error } = await supabase
    .from('meal_plan_entries')
    .insert(newEntries)
    .select(`
      *,
      recipes(id, title, servings, recipe_images(id, url, type, sort_order))
    `)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

**Step 4: Commit**

```bash
git add src/app/api/meal-plans/
git commit -m "feat: add meal plan API routes (CRUD + copy week)"
```

---

## Task 4: Shopping List API Routes

**Files:**
- Create: `src/app/api/shopping/lists/route.ts` (GET list, POST create)
- Create: `src/app/api/shopping/lists/[id]/route.ts` (DELETE)
- Create: `src/app/api/shopping/lists/[id]/items/route.ts` (POST add items)
- Create: `src/app/api/shopping/lists/[id]/items/[itemId]/route.ts` (PATCH, DELETE)
- Create: `src/app/api/shopping/generate/route.ts` (POST generate draft)

**Step 1: Write shopping list CRUD routes**

`src/app/api/shopping/lists/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = new URL(request.url).searchParams.get('householdId')
  if (!householdId) return NextResponse.json({ error: 'householdId is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('todo_lists')
    .select(`
      *,
      todo_items(id, status)
    `)
    .eq('household_id', householdId)
    .eq('list_type', 'shopping')
    .eq('archived', false)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Add item counts
  const lists = (data || []).map((list) => ({
    ...list,
    total_items: list.todo_items?.length || 0,
    completed_items: list.todo_items?.filter((i: any) => i.status === 'completed').length || 0,
  }))

  return NextResponse.json(lists)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { household_id, title } = await request.json()
  if (!household_id || !title) {
    return NextResponse.json({ error: 'household_id and title are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('todo_lists')
    .insert({
      household_id,
      title,
      list_type: 'shopping',
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

`src/app/api/shopping/lists/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('todo_lists')
    .select(`
      *,
      todo_items(*)
    `)
    .eq('id', id)
    .eq('list_type', 'shopping')
    .order('sort_order', { referencedTable: 'todo_items', ascending: true })
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('todo_lists').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

**Step 2: Write shopping item routes**

`src/app/api/shopping/lists/[id]/items/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: listId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const items = Array.isArray(body) ? body : [body]

  const rows = items.map((item, idx) => ({
    list_id: listId,
    title: item.title,
    quantity: item.quantity ?? null,
    unit: item.unit ?? null,
    sort_order: item.sort_order ?? idx,
    created_by: user.id,
  }))

  const { data, error } = await supabase
    .from('todo_items')
    .insert(rows)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

`src/app/api/shopping/lists/[id]/items/[itemId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { itemId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if ('status' in body) {
    updates.status = body.status
    updates.completed_at = body.status === 'completed' ? new Date().toISOString() : null
  }
  if ('title' in body) updates.title = body.title
  if ('quantity' in body) updates.quantity = body.quantity
  if ('unit' in body) updates.unit = body.unit
  if ('sort_order' in body) updates.sort_order = body.sort_order

  const { data, error } = await supabase
    .from('todo_items')
    .update(updates)
    .eq('id', itemId)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { itemId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('todo_items').delete().eq('id', itemId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

**Step 3: Write the shopping list generation endpoint**

`src/app/api/shopping/generate/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aggregateIngredients, type MealPlanIngredient } from '@/lib/utils/aggregate-ingredients'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { household_id, from, to } = await request.json()

  if (!household_id || !from || !to) {
    return NextResponse.json({ error: 'household_id, from, and to are required' }, { status: 400 })
  }

  // 1. Fetch meal plan entries with recipe ingredients
  const { data: entries, error: entriesError } = await supabase
    .from('meal_plan_entries')
    .select(`
      *,
      recipes(
        id, title, servings,
        recipe_ingredients(name, quantity, unit)
      )
    `)
    .eq('household_id', household_id)
    .gte('date', from)
    .lte('date', to)
    .neq('status', 'skipped')

  if (entriesError) return NextResponse.json({ error: entriesError.message }, { status: 500 })

  // 2. Collect all ingredients with scaling info
  const allIngredients: MealPlanIngredient[] = []

  for (const entry of entries || []) {
    if (!entry.recipes?.recipe_ingredients) continue
    for (const ing of entry.recipes.recipe_ingredients) {
      if (!ing.name) continue
      allIngredients.push({
        name: ing.name,
        quantity: ing.quantity,
        unit: ing.unit,
        servings: entry.servings,
        recipeServings: entry.recipes.servings,
      })
    }
  }

  // 3. Aggregate
  const aggregated = aggregateIngredients(allIngredients)

  // 4. Fetch household staples and merge
  const { data: staples } = await supabase
    .from('household_staples')
    .select('*')
    .eq('household_id', household_id)

  const stapleItems = (staples || []).map((s) => ({
    name: s.name,
    quantity: s.default_quantity,
    unit: s.default_unit,
    isStaple: true,
  }))

  // Merge: if a staple name already exists in aggregated, mark it; otherwise add it
  const draft = aggregated.map((item) => ({
    ...item,
    isStaple: false,
  }))

  for (const staple of stapleItems) {
    const existing = draft.find((d) => d.name.toLowerCase() === staple.name.toLowerCase())
    if (existing) {
      existing.isStaple = true
    } else {
      draft.push(staple)
    }
  }

  return NextResponse.json({
    from,
    to,
    entry_count: (entries || []).length,
    items: draft,
  })
}
```

**Step 4: Commit**

```bash
git add src/app/api/shopping/
git commit -m "feat: add shopping list API routes with generation from meal plans"
```

---

## Task 5: Household Staples API Routes

**Files:**
- Create: `src/app/api/households/[id]/staples/route.ts` (GET, POST)
- Create: `src/app/api/households/[id]/staples/[stapleId]/route.ts` (PATCH, DELETE)

**Step 1: Write the routes**

`src/app/api/households/[id]/staples/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: householdId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('household_staples')
    .select('*')
    .eq('household_id', householdId)
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: householdId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, default_quantity, default_unit } = await request.json()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('household_staples')
    .insert({
      household_id: householdId,
      name: name.trim().toLowerCase(),
      default_quantity: default_quantity ?? null,
      default_unit: default_unit ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

`src/app/api/households/[id]/staples/[stapleId]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stapleId: string }> }
) {
  const { stapleId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}
  if ('name' in body) updates.name = body.name.trim().toLowerCase()
  if ('default_quantity' in body) updates.default_quantity = body.default_quantity
  if ('default_unit' in body) updates.default_unit = body.default_unit

  const { data, error } = await supabase
    .from('household_staples')
    .update(updates)
    .eq('id', stapleId)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; stapleId: string }> }
) {
  const { stapleId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('household_staples').delete().eq('id', stapleId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

**Step 2: Commit**

```bash
git add src/app/api/households/\[id\]/staples/
git commit -m "feat: add household staples CRUD API routes"
```

---

## Task 6: Meal Plan Weekly Grid UI

This is the largest UI task. Break it into sub-components.

**Files:**
- Create: `src/components/features/meal-plan/weekly-grid.tsx` — Main grid component
- Create: `src/components/features/meal-plan/meal-cell.tsx` — Single cell (day × meal type)
- Create: `src/components/features/meal-plan/meal-card.tsx` — Entry card within a cell
- Create: `src/components/features/meal-plan/add-meal-dialog.tsx` — Add/edit meal dialog
- Create: `src/components/features/meal-plan/copy-week-dialog.tsx` — Copy week dialog
- Modify: `src/app/(dashboard)/meal-plans/page.tsx` — Replace stub

### Sub-task 6a: Week utility helpers

**Files:**
- Create: `src/lib/utils/week.ts`
- Create: `src/lib/utils/week.test.ts`

**Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest'
import { getWeekStart, getWeekDays, formatWeekLabel } from './week'

describe('getWeekStart', () => {
  it('returns Monday for a Wednesday', () => {
    const wed = new Date('2026-03-11') // Wednesday
    const monday = getWeekStart(wed)
    expect(monday.toISOString().split('T')[0]).toBe('2026-03-09')
  })

  it('returns same day if already Monday', () => {
    const mon = new Date('2026-03-09')
    expect(getWeekStart(mon).toISOString().split('T')[0]).toBe('2026-03-09')
  })

  it('handles Sunday (returns previous Monday)', () => {
    const sun = new Date('2026-03-15')
    expect(getWeekStart(sun).toISOString().split('T')[0]).toBe('2026-03-09')
  })
})

describe('getWeekDays', () => {
  it('returns 7 days starting from the given Monday', () => {
    const monday = new Date('2026-03-09')
    const days = getWeekDays(monday)
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-03-09')
    expect(days[6]).toBe('2026-03-15')
  })
})

describe('formatWeekLabel', () => {
  it('formats week range', () => {
    const label = formatWeekLabel(new Date('2026-03-09'))
    expect(label).toContain('Mar')
    expect(label).toContain('9')
    expect(label).toContain('15')
  })
})
```

**Step 2: Implement**

```typescript
export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  // getDay: 0=Sun, 1=Mon. We want Monday as start.
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function getWeekDays(weekStart: Date): string[] {
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

export function formatWeekLabel(weekStart: Date): string {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)

  const startMonth = weekStart.toLocaleDateString('en-GB', { month: 'short' })
  const endMonth = end.toLocaleDateString('en-GB', { month: 'short' })

  if (startMonth === endMonth) {
    return `${startMonth} ${weekStart.getDate()}–${end.getDate()}, ${weekStart.getFullYear()}`
  }
  return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`
}

export function shiftWeek(weekStart: Date, weeks: number): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + weeks * 7)
  return d
}

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealType = (typeof MEAL_TYPES)[number]
```

**Step 3: Run tests, commit**

```bash
git add src/lib/utils/week.ts src/lib/utils/week.test.ts
git commit -m "feat: add week utility helpers"
```

### Sub-task 6b: Meal card and cell components

**Step 1: Create meal-card.tsx**

`src/components/features/meal-plan/meal-card.tsx`:

```typescript
'use client'

import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getMemberBgClass } from '@/lib/utils/member-colors'

interface MealCardProps {
  entry: {
    id: string
    recipe_id: string | null
    custom_name: string | null
    servings: number
    assigned_to: string[]
    status: string
    recipes?: { id: string; title: string; recipe_images?: { url: string; type: string }[] } | null
  }
  persons: { id: string; display_name: string }[]
  onEdit: () => void
  onDelete: () => void
}

export function MealCard({ entry, persons, onEdit, onDelete }: MealCardProps) {
  const title = entry.recipes?.title || entry.custom_name || 'Untitled'
  const thumbnail = entry.recipes?.recipe_images?.find((img) => img.type === 'photo')?.url
  const assignedPersons = persons.filter((p) => entry.assigned_to.includes(p.id))

  return (
    <div
      className="group relative flex items-start gap-2 rounded-md border bg-card p-2 text-sm cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onEdit}
    >
      {thumbnail && (
        <img
          src={thumbnail}
          alt=""
          className="h-8 w-8 rounded object-cover flex-shrink-0"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{title}</p>
        {assignedPersons.length > 0 && assignedPersons.length < persons.length && (
          <div className="flex gap-0.5 mt-0.5">
            {assignedPersons.map((p) => (
              <span
                key={p.id}
                className={`inline-block h-4 w-4 rounded-full text-[10px] leading-4 text-center text-white ${getMemberBgClass(p.id)}`}
                title={p.display_name}
              >
                {p.display_name[0]}
              </span>
            ))}
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 opacity-0 group-hover:opacity-100 flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}
```

**Step 2: Create meal-cell.tsx**

`src/components/features/meal-plan/meal-cell.tsx`:

```typescript
'use client'

import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MealCard } from './meal-card'

interface MealCellProps {
  entries: any[]
  persons: { id: string; display_name: string }[]
  onAdd: () => void
  onEdit: (entry: any) => void
  onDelete: (entryId: string) => void
}

export function MealCell({ entries, persons, onAdd, onEdit, onDelete }: MealCellProps) {
  return (
    <div className="min-h-[60px] space-y-1 p-1">
      {entries.map((entry) => (
        <MealCard
          key={entry.id}
          entry={entry}
          persons={persons}
          onEdit={() => onEdit(entry)}
          onDelete={() => onDelete(entry.id)}
        />
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="w-full h-6 text-xs text-muted-foreground hover:text-foreground"
        onClick={onAdd}
      >
        <Plus className="h-3 w-3 mr-1" />
        Add
      </Button>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/components/features/meal-plan/meal-card.tsx src/components/features/meal-plan/meal-cell.tsx
git commit -m "feat: add meal card and cell components"
```

### Sub-task 6c: Add/edit meal dialog

**Step 1: Create add-meal-dialog.tsx**

`src/components/features/meal-plan/add-meal-dialog.tsx`:

This dialog has two tabs: "From Recipe" (search household recipes) and "Custom" (free text). It includes a member multi-select for per-person assignment and servings input.

```typescript
'use client'

import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MemberPicker } from '@/components/features/member-picker'
import { Loader2 } from 'lucide-react'

interface Person {
  id: string
  display_name: string
  date_of_birth: string | null
  person_type: string
}

interface AddMealDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  householdId: string
  date: string
  mealType: string
  persons: Person[]
  editingEntry?: any | null
  onSave: (entry: {
    recipe_id?: string
    custom_name?: string
    servings: number
    assigned_to: string[]
    notes?: string
  }) => Promise<void>
}

export function AddMealDialog({
  open, onOpenChange, householdId, date, mealType, persons, editingEntry, onSave,
}: AddMealDialogProps) {
  const [tab, setTab] = useState<'recipe' | 'custom'>(
    editingEntry?.recipe_id ? 'recipe' : editingEntry?.custom_name ? 'custom' : 'recipe'
  )
  const [recipeSearch, setRecipeSearch] = useState('')
  const [recipes, setRecipes] = useState<any[]>([])
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(
    editingEntry?.recipe_id || null
  )
  const [customName, setCustomName] = useState(editingEntry?.custom_name || '')
  const [servings, setServings] = useState(editingEntry?.servings || 2)
  const [assignedTo, setAssignedTo] = useState<string[]>(editingEntry?.assigned_to || [])
  const [notes, setNotes] = useState(editingEntry?.notes || '')
  const [saving, setSaving] = useState(false)
  const [loadingRecipes, setLoadingRecipes] = useState(false)

  // Fetch recipes for search
  useEffect(() => {
    if (!open || !householdId) return
    setLoadingRecipes(true)
    fetch(`/api/recipes?householdId=${householdId}&search=${encodeURIComponent(recipeSearch)}`)
      .then((r) => r.json())
      .then((data) => setRecipes(Array.isArray(data) ? data : []))
      .catch(() => setRecipes([]))
      .finally(() => setLoadingRecipes(false))
  }, [open, householdId, recipeSearch])

  // Reset form when opening with new entry
  useEffect(() => {
    if (open) {
      if (editingEntry) {
        setTab(editingEntry.recipe_id ? 'recipe' : 'custom')
        setSelectedRecipeId(editingEntry.recipe_id || null)
        setCustomName(editingEntry.custom_name || '')
        setServings(editingEntry.servings || 2)
        setAssignedTo(editingEntry.assigned_to || [])
        setNotes(editingEntry.notes || '')
      } else {
        setTab('recipe')
        setSelectedRecipeId(null)
        setCustomName('')
        setServings(2)
        setAssignedTo([])
        setNotes('')
      }
      setRecipeSearch('')
    }
  }, [open, editingEntry])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({
        recipe_id: tab === 'recipe' ? selectedRecipeId || undefined : undefined,
        custom_name: tab === 'custom' ? customName.trim() || undefined : undefined,
        servings,
        assigned_to: assignedTo,
        notes: notes.trim() || undefined,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const canSave = tab === 'recipe' ? !!selectedRecipeId : !!customName.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingEntry ? 'Edit Meal' : 'Add Meal'} — {mealType} on {date}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'recipe' | 'custom')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="recipe">From Recipe</TabsTrigger>
            <TabsTrigger value="custom">Custom</TabsTrigger>
          </TabsList>

          <TabsContent value="recipe" className="space-y-3">
            <Input
              placeholder="Search recipes..."
              value={recipeSearch}
              onChange={(e) => setRecipeSearch(e.target.value)}
            />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {loadingRecipes && <p className="text-sm text-muted-foreground p-2">Loading...</p>}
              {!loadingRecipes && recipes.length === 0 && (
                <p className="text-sm text-muted-foreground p-2">No recipes found</p>
              )}
              {recipes.map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedRecipeId === recipe.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => {
                    setSelectedRecipeId(recipe.id)
                    setServings(recipe.servings || 2)
                  }}
                >
                  {recipe.title}
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="custom" className="space-y-3">
            <div>
              <Label htmlFor="custom-name">Meal Name</Label>
              <Input
                id="custom-name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Leftovers, Eating out"
              />
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-3 pt-2">
          <div>
            <Label htmlFor="servings">Servings</Label>
            <Input
              id="servings"
              type="number"
              min={1}
              value={servings}
              onChange={(e) => setServings(parseInt(e.target.value) || 1)}
            />
          </div>

          {persons.length > 0 && (
            <div>
              <Label>Assign to</Label>
              <p className="text-xs text-muted-foreground mb-1">
                Leave empty for whole household
              </p>
              <MemberPicker
                persons={persons}
                selected={assignedTo}
                onChange={setAssignedTo}
              />
            </div>
          )}

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingEntry ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/features/meal-plan/add-meal-dialog.tsx
git commit -m "feat: add meal dialog with recipe search and member assignment"
```

### Sub-task 6d: Copy week dialog

**Step 1: Create copy-week-dialog.tsx**

`src/components/features/meal-plan/copy-week-dialog.tsx`:

```typescript
'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { getWeekStart, formatWeekLabel, shiftWeek } from '@/lib/utils/week'

interface CopyWeekDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentWeekStart: Date
  onCopy: (sourceWeekStart: string) => Promise<void>
}

export function CopyWeekDialog({ open, onOpenChange, currentWeekStart, onCopy }: CopyWeekDialogProps) {
  const [sourceOffset, setSourceOffset] = useState(-1) // Default: previous week
  const [copying, setCopying] = useState(false)

  const sourceWeek = shiftWeek(currentWeekStart, sourceOffset)

  const handleCopy = async () => {
    setCopying(true)
    try {
      await onCopy(sourceWeek.toISOString().split('T')[0])
      onOpenChange(false)
    } finally {
      setCopying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Copy Week</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Label>Copy from</Label>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSourceOffset((o) => o - 1)}
            >
              ←
            </Button>
            <span className="flex-1 text-center text-sm">
              {formatWeekLabel(sourceWeek)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSourceOffset((o) => o + 1)}
              disabled={sourceOffset >= -1 && shiftWeek(currentWeekStart, sourceOffset + 1).getTime() === currentWeekStart.getTime()}
            >
              →
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            This will copy all meals from the selected week into the current week ({formatWeekLabel(currentWeekStart)}).
            Existing meals in the current week will not be removed.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCopy} disabled={copying}>
            {copying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/features/meal-plan/copy-week-dialog.tsx
git commit -m "feat: add copy week dialog"
```

### Sub-task 6e: Weekly grid component

`src/components/features/meal-plan/weekly-grid.tsx`:

This is the main client component that ties everything together. It manages state for the current week, fetches entries, and handles all CRUD operations.

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Copy, Calendar } from 'lucide-react'
import { MealCell } from './meal-cell'
import { AddMealDialog } from './add-meal-dialog'
import { CopyWeekDialog } from './copy-week-dialog'
import { getWeekStart, getWeekDays, formatWeekLabel, shiftWeek, MEAL_TYPES, type MealType } from '@/lib/utils/week'

interface Person {
  id: string
  display_name: string
  date_of_birth: string | null
  person_type: string
}

interface WeeklyGridProps {
  householdId: string
  persons: Person[]
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function WeeklyGrid({ householdId, persons }: WeeklyGridProps) {
  const router = useRouter()
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog state
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addDialogDate, setAddDialogDate] = useState('')
  const [addDialogMealType, setAddDialogMealType] = useState<MealType>('dinner')
  const [editingEntry, setEditingEntry] = useState<any | null>(null)
  const [copyDialogOpen, setCopyDialogOpen] = useState(false)

  const weekDays = getWeekDays(weekStart)
  const weekEnd = weekDays[6]

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/meal-plans?householdId=${householdId}&from=${weekDays[0]}&to=${weekEnd}`
      )
      if (res.ok) {
        const data = await res.json()
        setEntries(data)
      }
    } finally {
      setLoading(false)
    }
  }, [householdId, weekDays[0], weekEnd])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const handleAdd = (date: string, mealType: MealType) => {
    setEditingEntry(null)
    setAddDialogDate(date)
    setAddDialogMealType(mealType)
    setAddDialogOpen(true)
  }

  const handleEdit = (entry: any) => {
    setEditingEntry(entry)
    setAddDialogDate(entry.date)
    setAddDialogMealType(entry.meal_type)
    setAddDialogOpen(true)
  }

  const handleSave = async (data: {
    recipe_id?: string
    custom_name?: string
    servings: number
    assigned_to: string[]
    notes?: string
  }) => {
    if (editingEntry) {
      const res = await fetch(`/api/meal-plans/${editingEntry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update')
    } else {
      const res = await fetch('/api/meal-plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: householdId,
          date: addDialogDate,
          meal_type: addDialogMealType,
          ...data,
        }),
      })
      if (!res.ok) throw new Error('Failed to create')
    }
    await fetchEntries()
  }

  const handleDelete = async (entryId: string) => {
    const res = await fetch(`/api/meal-plans/${entryId}`, { method: 'DELETE' })
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId))
    }
  }

  const handleCopyWeek = async (sourceWeekStart: string) => {
    const res = await fetch('/api/meal-plans/copy-week', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        household_id: householdId,
        sourceWeekStart,
        targetWeekStart: weekDays[0],
      }),
    })
    if (!res.ok) throw new Error('Failed to copy week')
    await fetchEntries()
  }

  const getEntriesForCell = (date: string, mealType: string) =>
    entries.filter((e) => e.date === date && e.meal_type === mealType)

  const today = new Date().toISOString().split('T')[0]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(shiftWeek(weekStart, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[200px] text-center">
            {formatWeekLabel(weekStart)}
          </h2>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(shiftWeek(weekStart, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(getWeekStart(new Date()))}
          >
            <Calendar className="mr-1 h-4 w-4" />
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCopyDialogOpen(true)}>
            <Copy className="mr-1 h-4 w-4" />
            Copy Week
          </Button>
        </div>
      </div>

      {/* Desktop grid */}
      <div className="hidden md:block overflow-x-auto">
        <div className="grid grid-cols-[100px_repeat(7,1fr)] gap-px bg-border rounded-lg overflow-hidden min-w-[800px]">
          {/* Column headers */}
          <div className="bg-muted p-2" /> {/* Empty corner */}
          {weekDays.map((date, i) => (
            <div
              key={date}
              className={`bg-muted p-2 text-center text-sm font-medium ${
                date === today ? 'bg-primary/10 text-primary' : ''
              }`}
            >
              <div>{DAY_NAMES[i]}</div>
              <div className="text-xs text-muted-foreground">{new Date(date + 'T12:00:00').getDate()}</div>
            </div>
          ))}

          {/* Rows per meal type */}
          {MEAL_TYPES.map((mealType) => (
            <>
              <div key={`label-${mealType}`} className="bg-muted p-2 text-sm font-medium capitalize flex items-start">
                {mealType}
              </div>
              {weekDays.map((date) => (
                <div
                  key={`${date}-${mealType}`}
                  className={`bg-card ${date === today ? 'bg-primary/5' : ''}`}
                >
                  <MealCell
                    entries={getEntriesForCell(date, mealType)}
                    persons={persons}
                    onAdd={() => handleAdd(date, mealType)}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                </div>
              ))}
            </>
          ))}
        </div>
      </div>

      {/* Mobile: stacked day view */}
      <div className="md:hidden space-y-4">
        {weekDays.map((date, i) => (
          <div key={date} className={`rounded-lg border ${date === today ? 'border-primary' : ''}`}>
            <div className={`p-3 font-medium border-b ${date === today ? 'bg-primary/10' : 'bg-muted'}`}>
              {DAY_NAMES[i]} {new Date(date + 'T12:00:00').getDate()}
            </div>
            <div className="divide-y">
              {MEAL_TYPES.map((mealType) => {
                const cellEntries = getEntriesForCell(date, mealType)
                return (
                  <div key={mealType} className="p-2">
                    <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                      {mealType}
                    </div>
                    <MealCell
                      entries={cellEntries}
                      persons={persons}
                      onAdd={() => handleAdd(date, mealType)}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Dialogs */}
      <AddMealDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        householdId={householdId}
        date={addDialogDate}
        mealType={addDialogMealType}
        persons={persons}
        editingEntry={editingEntry}
        onSave={handleSave}
      />

      <CopyWeekDialog
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        currentWeekStart={weekStart}
        onCopy={handleCopyWeek}
      />
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/components/features/meal-plan/weekly-grid.tsx
git commit -m "feat: add weekly grid component with desktop and mobile layouts"
```

### Sub-task 6f: Wire up the meal plans page

**Step 1: Replace the stub page**

`src/app/(dashboard)/meal-plans/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { WeeklyGrid } from '@/components/features/meal-plan/weekly-grid'

export default async function MealPlansPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .single()

  const householdId = profile?.default_household_id
  if (!householdId) return null

  const { data: persons } = await supabase
    .from('household_persons')
    .select('id, display_name, date_of_birth, person_type')
    .eq('household_id', householdId)

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Meal Plans</h1>
      <WeeklyGrid householdId={householdId} persons={persons || []} />
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/app/\(dashboard\)/meal-plans/page.tsx
git commit -m "feat: wire up meal plans page with weekly grid"
```

---

## Task 7: Shopping List UI

**Files:**
- Create: `src/components/features/shopping/shopping-list-view.tsx` — Main list of shopping lists
- Create: `src/components/features/shopping/shopping-list-detail.tsx` — Single list with items
- Create: `src/components/features/shopping/generate-dialog.tsx` — Generation flow (date range → draft review → confirm)
- Create: `src/app/(dashboard)/shopping/[id]/page.tsx` — Detail page
- Modify: `src/app/(dashboard)/shopping/page.tsx` — Replace stub

### Sub-task 7a: Generate shopping list dialog

`src/components/features/shopping/generate-dialog.tsx`:

```typescript
'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2 } from 'lucide-react'
import { getWeekStart, getWeekDays } from '@/lib/utils/week'

interface DraftItem {
  name: string
  quantity: number | null
  unit: string | null
  isStaple: boolean
  included: boolean
}

interface GenerateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  householdId: string
  onConfirm: (title: string, items: { title: string; quantity: number | null; unit: string | null }[]) => Promise<void>
}

export function GenerateDialog({ open, onOpenChange, householdId, onConfirm }: GenerateDialogProps) {
  const [step, setStep] = useState<'dates' | 'review'>('dates')
  const [from, setFrom] = useState(() => {
    const ws = getWeekStart(new Date())
    return ws.toISOString().split('T')[0]
  })
  const [to, setTo] = useState(() => {
    const ws = getWeekStart(new Date())
    const days = getWeekDays(ws)
    return days[6]
  })
  const [draft, setDraft] = useState<DraftItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [entryCount, setEntryCount] = useState(0)
  const [manualItem, setManualItem] = useState('')

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/shopping/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: householdId, from, to }),
      })
      if (!res.ok) throw new Error('Generation failed')
      const data = await res.json()
      setDraft(
        data.items.map((item: any) => ({ ...item, included: true }))
      )
      setEntryCount(data.entry_count)
      setStep('review')
    } finally {
      setLoading(false)
    }
  }

  const toggleItem = (index: number) => {
    setDraft((prev) =>
      prev.map((item, i) => (i === index ? { ...item, included: !item.included } : item))
    )
  }

  const updateQuantity = (index: number, quantity: string) => {
    setDraft((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, quantity: quantity ? parseFloat(quantity) : null } : item
      )
    )
  }

  const addManualItem = () => {
    if (!manualItem.trim()) return
    setDraft((prev) => [
      ...prev,
      { name: manualItem.trim(), quantity: null, unit: null, isStaple: false, included: true },
    ])
    setManualItem('')
  }

  const handleConfirm = async () => {
    setSaving(true)
    try {
      const items = draft
        .filter((item) => item.included)
        .map((item) => ({
          title: item.name,
          quantity: item.quantity,
          unit: item.unit,
        }))
      const title = `Shop ${from} to ${to}`
      await onConfirm(title, items)
      onOpenChange(false)
      // Reset for next use
      setStep('dates')
      setDraft([])
    } finally {
      setSaving(false)
    }
  }

  const handleClose = (open: boolean) => {
    if (!open) {
      setStep('dates')
      setDraft([])
    }
    onOpenChange(open)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === 'dates' ? 'Generate Shopping List' : `Review (${entryCount} meals)`}
          </DialogTitle>
        </DialogHeader>

        {step === 'dates' && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="from">From</Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={handleGenerate} disabled={loading || !from || !to}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Generate
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'review' && (
          <>
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {draft.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No ingredients found for this date range.
                </p>
              ) : (
                draft.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={item.included}
                      onCheckedChange={() => toggleItem(idx)}
                    />
                    <span className="flex-1 text-sm">
                      {item.name}
                      {item.isStaple && (
                        <span className="text-xs text-muted-foreground ml-1">(staple)</span>
                      )}
                    </span>
                    <Input
                      type="number"
                      className="w-20 h-7 text-sm"
                      value={item.quantity ?? ''}
                      onChange={(e) => updateQuantity(idx, e.target.value)}
                      placeholder="qty"
                    />
                    <span className="text-xs text-muted-foreground w-16 truncate">
                      {item.unit || ''}
                    </span>
                  </div>
                ))
              )}

              {/* Manual add */}
              <div className="flex items-center gap-2 pt-2 border-t mt-2">
                <Input
                  className="flex-1 h-8 text-sm"
                  placeholder="Add item..."
                  value={manualItem}
                  onChange={(e) => setManualItem(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addManualItem()}
                />
                <Button size="sm" variant="outline" onClick={addManualItem}>
                  Add
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('dates')}>Back</Button>
              <Button onClick={handleConfirm} disabled={saving || draft.filter((d) => d.included).length === 0}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create List ({draft.filter((d) => d.included).length} items)
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

**Commit:**

```bash
git add src/components/features/shopping/generate-dialog.tsx
git commit -m "feat: add shopping list generation dialog with draft review"
```

### Sub-task 7b: Shopping list detail component

`src/components/features/shopping/shopping-list-detail.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { ArrowLeft, Plus, Trash2, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface ShoppingItem {
  id: string
  title: string
  quantity: number | null
  unit: string | null
  status: string
  sort_order: number
}

interface ShoppingListDetailProps {
  list: {
    id: string
    title: string
    todo_items: ShoppingItem[]
  }
}

export function ShoppingListDetail({ list: initialList }: ShoppingListDetailProps) {
  const router = useRouter()
  const [items, setItems] = useState<ShoppingItem[]>(initialList.todo_items || [])
  const [newItemTitle, setNewItemTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const pendingItems = items.filter((i) => i.status !== 'completed')
  const completedItems = items.filter((i) => i.status === 'completed')

  const toggleItem = async (item: ShoppingItem) => {
    const newStatus = item.status === 'completed' ? 'pending' : 'completed'
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i))
    )
    await fetch(`/api/shopping/lists/${initialList.id}/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
  }

  const addItem = async () => {
    if (!newItemTitle.trim()) return
    setAdding(true)
    try {
      const res = await fetch(`/api/shopping/lists/${initialList.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newItemTitle.trim(),
          sort_order: items.length,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setItems((prev) => [...prev, ...(Array.isArray(data) ? data : [data])])
        setNewItemTitle('')
      }
    } finally {
      setAdding(false)
    }
  }

  const deleteItem = async (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== itemId))
    await fetch(`/api/shopping/lists/${initialList.id}/items/${itemId}`, {
      method: 'DELETE',
    })
  }

  const deleteList = async () => {
    if (!confirm('Delete this shopping list?')) return
    setDeleting(true)
    const res = await fetch(`/api/shopping/lists/${initialList.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/shopping')
      router.refresh()
    } else {
      setDeleting(false)
    }
  }

  const renderItem = (item: ShoppingItem) => (
    <div
      key={item.id}
      className="flex items-center gap-2 py-2 px-2 rounded hover:bg-muted/50 group"
    >
      <Checkbox
        checked={item.status === 'completed'}
        onCheckedChange={() => toggleItem(item)}
      />
      <span
        className={`flex-1 text-sm ${
          item.status === 'completed' ? 'line-through text-muted-foreground' : ''
        }`}
      >
        {item.quantity && (
          <span className="font-medium">
            {item.quantity}{item.unit ? ` ${item.unit}` : ''}{' '}
          </span>
        )}
        {item.title}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100"
        onClick={() => deleteItem(item.id)}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  )

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/shopping">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
        </Link>
        <h1 className="flex-1 text-2xl font-bold">{initialList.title}</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={deleteList}
          disabled={deleting}
          className="text-destructive"
        >
          <Trash2 className="mr-1 h-4 w-4" /> Delete
        </Button>
      </div>

      {/* Add item */}
      <div className="flex gap-2">
        <Input
          placeholder="Add item..."
          value={newItemTitle}
          onChange={(e) => setNewItemTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
        />
        <Button onClick={addItem} disabled={adding || !newItemTitle.trim()}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>

      {/* Pending items */}
      <div className="space-y-0.5">
        {pendingItems.length === 0 && completedItems.length === 0 && (
          <p className="text-muted-foreground text-sm py-8 text-center">No items yet</p>
        )}
        {pendingItems.map(renderItem)}
      </div>

      {/* Completed items */}
      {completedItems.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase mb-1">
            Completed ({completedItems.length})
          </p>
          <div className="space-y-0.5">
            {completedItems.map(renderItem)}
          </div>
        </div>
      )}
    </div>
  )
}
```

**Commit:**

```bash
git add src/components/features/shopping/shopping-list-detail.tsx
git commit -m "feat: add shopping list detail component with item management"
```

### Sub-task 7c: Shopping list view and pages

`src/components/features/shopping/shopping-list-view.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ShoppingCart, Plus } from 'lucide-react'
import { GenerateDialog } from './generate-dialog'
import Link from 'next/link'

interface ShoppingList {
  id: string
  title: string
  created_at: string
  total_items: number
  completed_items: number
}

interface ShoppingListViewProps {
  householdId: string
  lists: ShoppingList[]
}

export function ShoppingListView({ householdId, lists: initialLists }: ShoppingListViewProps) {
  const router = useRouter()
  const [lists, setLists] = useState(initialLists)
  const [generateOpen, setGenerateOpen] = useState(false)

  const handleCreateEmpty = async () => {
    const title = `Shopping List ${new Date().toLocaleDateString('en-GB')}`
    const res = await fetch('/api/shopping/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ household_id: householdId, title }),
    })
    if (res.ok) {
      const list = await res.json()
      router.push(`/shopping/${list.id}`)
      router.refresh()
    }
  }

  const handleGenerate = async (
    title: string,
    items: { title: string; quantity: number | null; unit: string | null }[]
  ) => {
    // Create list
    const listRes = await fetch('/api/shopping/lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ household_id: householdId, title }),
    })
    if (!listRes.ok) throw new Error('Failed to create list')
    const list = await listRes.json()

    // Add items
    if (items.length > 0) {
      const itemsRes = await fetch(`/api/shopping/lists/${list.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(items.map((item, idx) => ({ ...item, sort_order: idx }))),
      })
      if (!itemsRes.ok) throw new Error('Failed to add items')
    }

    router.push(`/shopping/${list.id}`)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={() => setGenerateOpen(true)}>
          <ShoppingCart className="mr-2 h-4 w-4" />
          Generate from Meal Plan
        </Button>
        <Button variant="outline" onClick={handleCreateEmpty}>
          <Plus className="mr-2 h-4 w-4" />
          Empty List
        </Button>
      </div>

      {lists.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground text-lg">No shopping lists yet.</p>
          <p className="text-muted-foreground text-sm mt-1">
            Generate one from your meal plan or create an empty list.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {lists.map((list) => (
            <Link key={list.id} href={`/shopping/${list.id}`}>
              <div className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                <div>
                  <h3 className="font-medium">{list.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {list.completed_items}/{list.total_items} items done
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  {new Date(list.created_at).toLocaleDateString('en-GB')}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <GenerateDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        householdId={householdId}
        onConfirm={handleGenerate}
      />
    </div>
  )
}
```

`src/app/(dashboard)/shopping/page.tsx` — replace stub:

```typescript
import { createClient } from '@/lib/supabase/server'
import { ShoppingListView } from '@/components/features/shopping/shopping-list-view'

export default async function ShoppingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .single()

  const householdId = profile?.default_household_id
  if (!householdId) return null

  const { data: lists } = await supabase
    .from('todo_lists')
    .select(`
      *,
      todo_items(id, status)
    `)
    .eq('household_id', householdId)
    .eq('list_type', 'shopping')
    .eq('archived', false)
    .order('created_at', { ascending: false })

  const shoppingLists = (lists || []).map((list) => ({
    ...list,
    total_items: list.todo_items?.length || 0,
    completed_items: list.todo_items?.filter((i: any) => i.status === 'completed').length || 0,
  }))

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Shopping</h1>
      <ShoppingListView householdId={householdId} lists={shoppingLists} />
    </div>
  )
}
```

`src/app/(dashboard)/shopping/[id]/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { ShoppingListDetail } from '@/components/features/shopping/shopping-list-detail'
import { notFound } from 'next/navigation'

export default async function ShoppingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: list, error } = await supabase
    .from('todo_lists')
    .select(`
      *,
      todo_items(*)
    `)
    .eq('id', id)
    .eq('list_type', 'shopping')
    .order('sort_order', { referencedTable: 'todo_items', ascending: true })
    .single()

  if (error || !list) notFound()

  return <ShoppingListDetail list={list as any} />
}
```

**Commit:**

```bash
git add src/components/features/shopping/shopping-list-view.tsx src/app/\(dashboard\)/shopping/
git commit -m "feat: add shopping list pages and list view component"
```

---

## Task 8: Household Staples UI

Add staples management to the household settings page.

**Files:**
- Create: `src/components/features/staples-manager.tsx`
- Modify: `src/app/(dashboard)/settings/page.tsx` — Add staples section

**Step 1: Create staples-manager.tsx**

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Trash2, Loader2 } from 'lucide-react'

interface Staple {
  id: string
  name: string
  default_quantity: number | null
  default_unit: string | null
}

interface StaplesManagerProps {
  householdId: string
  initialStaples: Staple[]
}

export function StaplesManager({ householdId, initialStaples }: StaplesManagerProps) {
  const [staples, setStaples] = useState(initialStaples)
  const [newName, setNewName] = useState('')
  const [newQty, setNewQty] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [adding, setAdding] = useState(false)

  const addStaple = async () => {
    if (!newName.trim()) return
    setAdding(true)
    try {
      const res = await fetch(`/api/households/${householdId}/staples`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          default_quantity: newQty ? parseFloat(newQty) : null,
          default_unit: newUnit.trim() || null,
        }),
      })
      if (res.ok) {
        const staple = await res.json()
        setStaples((prev) => [...prev, staple])
        setNewName('')
        setNewQty('')
        setNewUnit('')
      }
    } finally {
      setAdding(false)
    }
  }

  const deleteStaple = async (id: string) => {
    setStaples((prev) => prev.filter((s) => s.id !== id))
    await fetch(`/api/households/${householdId}/staples/${id}`, { method: 'DELETE' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Shopping Staples</CardTitle>
        <p className="text-sm text-muted-foreground">
          Items automatically included when generating shopping lists.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {staples.map((staple) => (
          <div key={staple.id} className="flex items-center gap-2 group">
            <span className="flex-1 text-sm">
              {staple.default_quantity && (
                <span className="font-medium">
                  {staple.default_quantity}{staple.default_unit ? ` ${staple.default_unit}` : ''}{' '}
                </span>
              )}
              {staple.name}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100"
              onClick={() => deleteStaple(staple.id)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}

        <div className="flex gap-2 pt-2 border-t">
          <Input
            className="flex-1"
            placeholder="Item name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addStaple()}
          />
          <Input
            className="w-16"
            placeholder="Qty"
            type="number"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
          />
          <Input
            className="w-20"
            placeholder="Unit"
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
          />
          <Button size="icon" onClick={addStaple} disabled={adding || !newName.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 2: Add to settings page**

Add a staples section to the existing settings page. Fetch staples server-side and pass to the component. The exact modification depends on the current settings page structure — add a `StaplesManager` component after the existing member management sections.

Server-side fetch to add:

```typescript
const { data: staples } = await supabase
  .from('household_staples')
  .select('*')
  .eq('household_id', householdId)
  .order('name', { ascending: true })
```

Then render:

```tsx
<StaplesManager householdId={householdId} initialStaples={staples || []} />
```

**Step 3: Commit**

```bash
git add src/components/features/staples-manager.tsx src/app/\(dashboard\)/settings/page.tsx
git commit -m "feat: add household staples management to settings"
```

---

## Task 9: Verify shadcn/ui Components

Several components used in the plan may not be installed yet. Check and install as needed:

- `Tabs` (`@/components/ui/tabs`)
- `Checkbox` (`@/components/ui/checkbox`)
- `Dialog` (likely already installed)
- `Card` (likely already installed)

**Step 1: Check existing components**

Run: `ls src/components/ui/`

**Step 2: Install missing components**

Run (for each missing one): `npx shadcn@latest add tabs checkbox`

**Step 3: Commit if new components added**

```bash
git add src/components/ui/
git commit -m "feat: add missing shadcn/ui components (tabs, checkbox)"
```

---

## Task 10: Integration Testing

**Files:**
- Create: `src/lib/utils/aggregate-ingredients.test.ts` (already done in Task 2)
- Create: `src/lib/utils/week.test.ts` (already done in Task 6a)

**Step 1: Run all tests**

Run: `npm run test:run`
Expected: All tests pass including new aggregate-ingredients and week tests.

**Step 2: Manual smoke test**

1. Start local dev: `npm run dev`
2. Navigate to /meal-plans — verify weekly grid renders
3. Add a meal from recipe — verify it appears in the grid
4. Add a custom meal — verify it appears
5. Assign to specific members — verify avatars show
6. Navigate weeks — verify data changes
7. Copy a week — verify entries duplicate
8. Navigate to /shopping — verify empty state
9. Click "Generate from Meal Plan" — verify draft shows ingredients
10. Confirm list — verify list appears with items
11. Check off items — verify they move to completed section
12. Go to /settings — verify staples section exists
13. Add a staple — verify it appears
14. Generate another shopping list — verify staple is included

**Step 3: Commit any fixes**

---

## Task 11: Final Polish and Build Check

**Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`

Fix any type errors.

**Step 2: Run linter**

Run: `npm run lint`

Fix any lint errors.

**Step 3: Run production build**

Run: `npm run build`

Fix any build errors.

**Step 4: Final commit**

```bash
git add -A
git commit -m "fix: resolve type and lint issues for meal planning + shopping"
```
