# Inventory Phase A Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inventory management with core CRUD (grouped by location/category) and a shopping-to-inventory bulk transfer flow with remembered defaults.

**Architecture:** New `inventory_items` and `inventory_defaults` tables with RLS. API routes in `src/app/api/inventory/`. Client components in `src/components/features/inventory/`. Server component page at `src/app/(dashboard)/inventory/page.tsx`. Shopping list detail gets a new "Add to Inventory" button that opens a review dialog.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + RLS), shadcn/ui, Tailwind CSS, TypeScript.

**Spec:** `docs/superpowers/specs/2026-03-10-inventory-phase-a-design.md`

---

## File Structure

### New Files
- `supabase/migrations/00012_inventory.sql` — Tables, indexes, RLS, triggers
- `src/app/api/inventory/route.ts` — GET (list) + POST (create single)
- `src/app/api/inventory/[id]/route.ts` — PUT (full update) + PATCH (partial) + DELETE
- `src/app/api/inventory/bulk/route.ts` — POST (bulk create from shopping)
- `src/app/api/inventory/defaults/route.ts` — GET (fetch defaults by names)
- `src/components/features/inventory/inventory-list.tsx` — Main client component
- `src/components/features/inventory/inventory-item-row.tsx` — Single item row
- `src/components/features/inventory/inventory-item-dialog.tsx` — Add/edit dialog
- `src/components/features/inventory/add-to-inventory-button.tsx` — Button for shopping list
- `src/components/features/inventory/add-to-inventory-review.tsx` — Review dialog
- `src/types/inventory.ts` — TypeScript types for inventory

### Modified Files
- `src/app/(dashboard)/inventory/page.tsx` — Replace stub with server component
- `src/components/features/shopping/shopping-list-detail.tsx` — Add "Add to Inventory" button

---

## Chunk 1: Database + Types + API Routes

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00012_inventory.sql`

- [ ] **Step 1: Write the migration**

```sql
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
-- Accepts a JSON array of items, handles duplicate merging, and upserts defaults
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
```

- [ ] **Step 2: Verify migration syntax**

Run: `cat supabase/migrations/00012_inventory.sql | head -5`
Expected: First lines of the migration file

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00012_inventory.sql
git commit -m "feat(inventory): add inventory_items and inventory_defaults tables"
```

### Task 2: TypeScript Types

**Files:**
- Create: `src/types/inventory.ts`

- [ ] **Step 1: Create inventory types**

These types are used by all components and API routes. They mirror the database schema but are defined manually since we can't run `supabase gen types` in all environments (see CLAUDE.md note about WSL2).

```typescript
export interface InventoryItem {
  id: string
  household_id: string
  created_by: string
  name: string
  display_name: string
  quantity: number | null
  unit: string | null
  location: 'fridge' | 'freezer' | 'pantry' | 'cupboard' | 'other'
  category: string | null
  expiry_date: string | null
  added_from: 'manual' | 'shopping_list'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface InventoryDefault {
  id: string
  household_id: string
  normalized_name: string
  location: string
  category: string | null
}

export type InventoryLocation = InventoryItem['location']

export const INVENTORY_LOCATIONS: { value: InventoryLocation; label: string; icon: string }[] = [
  { value: 'fridge', label: 'Fridge', icon: '🧊' },
  { value: 'freezer', label: 'Freezer', icon: '❄️' },
  { value: 'pantry', label: 'Pantry', icon: '🗄️' },
  { value: 'cupboard', label: 'Cupboard', icon: '🚪' },
  { value: 'other', label: 'Other', icon: '📦' },
]

export const INVENTORY_CATEGORIES = [
  'produce', 'dairy', 'meat', 'fish', 'grain',
  'tinned', 'spice', 'condiment', 'other',
] as const

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number]

export interface BulkInventoryItem {
  display_name: string
  name: string
  quantity: number | null
  unit: string | null
  location: InventoryLocation
  category: string | null
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/inventory.ts
git commit -m "feat(inventory): add TypeScript types for inventory"
```

### Task 3: Core API Routes — GET + POST

**Files:**
- Create: `src/app/api/inventory/route.ts`

- [ ] **Step 1: Write GET and POST route handlers**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeName } from '@/lib/utils/ingredients'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = new URL(request.url).searchParams.get('householdId')
  if (!householdId) return NextResponse.json({ error: 'householdId is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('household_id', householdId)
    .order('display_name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { household_id, display_name, quantity, unit, location, category, expiry_date, notes } = body

  if (!household_id || !display_name || !location) {
    return NextResponse.json({ error: 'household_id, display_name, and location are required' }, { status: 400 })
  }

  const name = normalizeName(display_name)

  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      household_id,
      created_by: user.id,
      name,
      display_name: display_name.trim(),
      quantity: quantity ?? null,
      unit: unit ?? null,
      location,
      category: category ?? null,
      expiry_date: expiry_date ?? null,
      added_from: 'manual',
      notes: notes ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Upsert inventory default for this item
  await supabase
    .from('inventory_defaults')
    .upsert(
      { household_id, normalized_name: name, location, category: category ?? null },
      { onConflict: 'household_id,normalized_name' }
    )

  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Verify file compiles**

Run: `npx tsc --noEmit src/app/api/inventory/route.ts 2>&1 | head -20`

Note: This may show type errors for the `inventory_items` and `inventory_defaults` table names since the generated Supabase types haven't been updated. That's expected — RLS ensures access control at the database level. If type errors block compilation, cast with `(supabase as any).from('inventory_items')` temporarily until types are regenerated.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/inventory/route.ts
git commit -m "feat(inventory): add GET and POST API routes"
```

### Task 4: API Routes — PUT + PATCH + DELETE

**Files:**
- Create: `src/app/api/inventory/[id]/route.ts`

- [ ] **Step 1: Write PUT, PATCH, and DELETE route handlers**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { normalizeName } from '@/lib/utils/ingredients'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { display_name, quantity, unit, location, category, expiry_date, notes } = body

  if (!display_name || !location) {
    return NextResponse.json({ error: 'display_name and location are required' }, { status: 400 })
  }

  const name = normalizeName(display_name)

  const { data, error } = await supabase
    .from('inventory_items')
    .update({
      name,
      display_name: display_name.trim(),
      quantity: quantity ?? null,
      unit: unit ?? null,
      location,
      category: category ?? null,
      expiry_date: expiry_date ?? null,
      notes: notes ?? null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Upsert inventory default
  await supabase
    .from('inventory_defaults')
    .upsert(
      { household_id: data.household_id, normalized_name: name, location, category: category ?? null },
      { onConflict: 'household_id,normalized_name' }
    )

  return NextResponse.json(data)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // PATCH only supports quantity and unit changes (for +/- buttons).
  // Use PUT for full edits including location/category.
  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if ('quantity' in body) updates.quantity = body.quantity
  if ('unit' in body) updates.unit = body.unit

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update (PATCH supports quantity and unit only)' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('inventory_items')
    .update(updates)
    .eq('id', id)
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
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('inventory_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/inventory/[id]/route.ts
git commit -m "feat(inventory): add PUT, PATCH, DELETE API routes"
```

### Task 5: Bulk API Route + Defaults Route

**Files:**
- Create: `src/app/api/inventory/bulk/route.ts`
- Create: `src/app/api/inventory/defaults/route.ts`

- [ ] **Step 1: Write bulk create route**

This calls the `inventory_bulk_transfer` PostgreSQL RPC function (defined in the migration) for transactional all-or-nothing execution. It also deduplicates incoming items before sending to the DB.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { BulkInventoryItem } from '@/types/inventory'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { household_id, items } = await request.json() as {
    household_id: string
    items: BulkInventoryItem[]
  }

  if (!household_id || !items?.length) {
    return NextResponse.json({ error: 'household_id and items are required' }, { status: 400 })
  }

  // Validate all items have location
  for (const item of items) {
    if (!item.location) {
      return NextResponse.json({ error: `Location required for "${item.display_name}"` }, { status: 400 })
    }
  }

  // Deduplicate incoming items: merge quantities for same name+location+unit
  const deduped = new Map<string, BulkInventoryItem>()
  for (const item of items) {
    const key = `${item.name}|${item.location}|${item.unit || ''}`
    const existing = deduped.get(key)
    if (existing && item.quantity != null) {
      existing.quantity = (existing.quantity ?? 0) + item.quantity
    } else if (!existing) {
      deduped.set(key, { ...item })
    }
  }

  const dedupedItems = Array.from(deduped.values())

  // Call transactional RPC function
  const { data, error } = await supabase.rpc('inventory_bulk_transfer', {
    p_household_id: household_id,
    p_created_by: user.id,
    p_items: dedupedItems,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, ...data }, { status: 201 })
}
```

- [ ] **Step 2: Write defaults lookup route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const householdId = url.searchParams.get('householdId')
  const names = url.searchParams.get('names') // comma-separated normalized names

  if (!householdId || !names) {
    return NextResponse.json({ error: 'householdId and names are required' }, { status: 400 })
  }

  const nameList = names.split(',').map((n) => n.trim()).filter(Boolean)

  const { data, error } = await supabase
    .from('inventory_defaults')
    .select('*')
    .eq('household_id', householdId)
    .in('normalized_name', nameList)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/inventory/bulk/route.ts src/app/api/inventory/defaults/route.ts
git commit -m "feat(inventory): add bulk create and defaults lookup API routes"
```

---

## Chunk 2: Inventory UI Components

### Task 6: Inventory Item Row Component

**Files:**
- Create: `src/components/features/inventory/inventory-item-row.tsx`

- [ ] **Step 1: Write the item row component**

This is the minimal row shown in the list: display_name, quantity+unit, +/- buttons, expiry badge. Tapping the row opens the edit dialog (handled by parent).

```typescript
'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Minus, Plus } from 'lucide-react'
import type { InventoryItem } from '@/types/inventory'

interface InventoryItemRowProps {
  item: InventoryItem
  onQuantityChange: (id: string, newQuantity: number) => void
  onClick: (item: InventoryItem) => void
}

function getExpiryBadge(expiryDate: string | null): { label: string; variant: 'destructive' | 'outline'; className?: string } | null {
  if (!expiryDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate + 'T00:00:00')
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays <= 1) return { label: diffDays <= 0 ? 'expired' : 'exp tomorrow', variant: 'destructive' }
  if (diffDays <= 3) return { label: `exp ${diffDays} days`, variant: 'outline', className: 'border-amber-500 text-amber-600 dark:text-amber-400' }
  return null
}

export function InventoryItemRow({ item, onQuantityChange, onClick }: InventoryItemRowProps) {
  const expiryBadge = getExpiryBadge(item.expiry_date)

  const handleQuantityChange = (delta: number) => {
    const currentQty = item.quantity ?? 0
    const newQty = Math.max(0, currentQty + delta)
    onQuantityChange(item.id, newQty)
  }

  return (
    <div
      className="flex items-center gap-2 py-2.5 px-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer group"
      onClick={() => onClick(item)}
    >
      <div className="flex-1 min-w-0">
        <span className="font-medium text-sm">{item.display_name}</span>
        {expiryBadge && (
          <Badge variant={expiryBadge.variant} className={`ml-2 text-[11px] ${expiryBadge.className || ''}`}>
            {expiryBadge.label}
          </Badge>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {item.quantity != null && (
          <span className="text-sm text-muted-foreground">
            {item.quantity}{item.unit ? ` ${item.unit}` : ''}
          </span>
        )}
        <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="icon"
            className="h-6 w-6"
            onClick={() => handleQuantityChange(-1)}
            disabled={item.quantity == null || item.quantity <= 0}
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-6 w-6"
            onClick={() => handleQuantityChange(1)}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/inventory/inventory-item-row.tsx
git commit -m "feat(inventory): add inventory item row component"
```

### Task 7: Inventory Item Dialog (Add/Edit)

**Files:**
- Create: `src/components/features/inventory/inventory-item-dialog.tsx`

- [ ] **Step 1: Write the add/edit dialog**

Used for both adding new items (via header button) and editing existing items (via row tap). When editing, all fields are pre-filled from the existing item.

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Trash2 } from 'lucide-react'
import { INVENTORY_LOCATIONS, INVENTORY_CATEGORIES } from '@/types/inventory'
import type { InventoryItem, InventoryLocation } from '@/types/inventory'

interface InventoryItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: InventoryItem | null // null = adding new item
  defaultLocation?: InventoryLocation // for quick-add from a location section
  onSave: (data: {
    display_name: string
    quantity: number | null
    unit: string | null
    location: InventoryLocation
    category: string | null
    expiry_date: string | null
    notes: string | null
  }) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

export function InventoryItemDialog({
  open,
  onOpenChange,
  item,
  defaultLocation,
  onSave,
  onDelete,
}: InventoryItemDialogProps) {
  const [displayName, setDisplayName] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [location, setLocation] = useState<InventoryLocation>('fridge')
  const [category, setCategory] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (open) {
      if (item) {
        setDisplayName(item.display_name)
        setQuantity(item.quantity != null ? String(item.quantity) : '')
        setUnit(item.unit || '')
        setLocation(item.location)
        setCategory(item.category || 'none')
        setExpiryDate(item.expiry_date || '')
        setNotes(item.notes || '')
      } else {
        setDisplayName('')
        setQuantity('')
        setUnit('')
        setLocation(defaultLocation || 'fridge')
        setCategory('none')
        setExpiryDate('')
        setNotes('')
      }
    }
  }, [open, item, defaultLocation])

  const handleSave = async () => {
    if (!displayName.trim()) return
    setSaving(true)
    try {
      await onSave({
        display_name: displayName.trim(),
        quantity: quantity ? parseFloat(quantity) : null,
        unit: unit.trim() || null,
        location,
        category: category && category !== 'none' ? category : null,
        expiry_date: expiryDate || null,
        notes: notes.trim() || null,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!item || !onDelete) return
    if (!confirm('Delete this item?')) return
    setDeleting(true)
    try {
      await onDelete(item.id)
      onOpenChange(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit Item' : 'Add Item'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="display-name">Name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Whole milk"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. L, kg, bags"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Location</Label>
              <Select value={location} onValueChange={(v) => setLocation(v as InventoryLocation)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVENTORY_LOCATIONS.map((loc) => (
                    <SelectItem key={loc.value} value={loc.value}>
                      {loc.icon} {loc.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {INVENTORY_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expiry">Expiry Date</Label>
            <Input
              id="expiry"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          {item && onDelete && (
            <Button variant="outline" onClick={handleDelete} disabled={deleting} className="text-destructive mr-auto">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || !displayName.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {item ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/inventory/inventory-item-dialog.tsx
git commit -m "feat(inventory): add inventory item add/edit dialog"
```

### Task 8: Inventory List Component

**Files:**
- Create: `src/components/features/inventory/inventory-list.tsx`

- [ ] **Step 1: Write the main list component**

This is the primary client component for the inventory page. It manages:
- Grouping items by location (default) or category (toggle)
- Search filtering
- Quick-add per section
- Inline +/- quantity with optimistic updates
- Opening the edit dialog

```typescript
'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search } from 'lucide-react'
import { InventoryItemRow } from './inventory-item-row'
import { InventoryItemDialog } from './inventory-item-dialog'
import { INVENTORY_LOCATIONS, INVENTORY_CATEGORIES } from '@/types/inventory'
import type { InventoryItem, InventoryLocation } from '@/types/inventory'

interface InventoryListProps {
  items: InventoryItem[]
  householdId: string
}

type GroupBy = 'location' | 'category'

export function InventoryList({ items: initialItems, householdId }: InventoryListProps) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems)
  const [groupBy, setGroupBy] = useState<GroupBy>('location')
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [quickAddLocation, setQuickAddLocation] = useState<InventoryLocation | null>(null)
  const [quickAddValue, setQuickAddValue] = useState('')
  const [quickAdding, setQuickAdding] = useState(false)

  // Filter by search
  const filteredItems = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (i) => i.display_name.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)
    )
  }, [items, search])

  // Group items
  const grouped = useMemo(() => {
    const groups: Record<string, InventoryItem[]> = {}
    for (const item of filteredItems) {
      const key = groupBy === 'location' ? item.location : (item.category || 'other')
      if (!groups[key]) groups[key] = []
      groups[key].push(item)
    }
    return groups
  }, [filteredItems, groupBy])

  // Ordered section keys
  const sectionKeys = groupBy === 'location'
    ? INVENTORY_LOCATIONS.map((l) => l.value).filter((k) => grouped[k]?.length)
    : [...INVENTORY_CATEGORIES, 'other' as const].filter((k) => grouped[k as string]?.length).map(String)

  const getSectionLabel = (key: string) => {
    if (groupBy === 'location') {
      const loc = INVENTORY_LOCATIONS.find((l) => l.value === key)
      return loc ? `${loc.icon} ${loc.label}` : key
    }
    return key.charAt(0).toUpperCase() + key.slice(1)
  }

  const handleQuantityChange = async (id: string, newQuantity: number) => {
    // Optimistic update
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity: newQuantity } : i)))
    await fetch(`/api/inventory/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: newQuantity }),
    })
  }

  const handleSave = async (data: {
    display_name: string
    quantity: number | null
    unit: string | null
    location: InventoryLocation
    category: string | null
    expiry_date: string | null
    notes: string | null
  }) => {
    if (editingItem) {
      // Update existing
      const res = await fetch(`/api/inventory/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const updated = await res.json()
        setItems((prev) => prev.map((i) => (i.id === editingItem.id ? updated : i)))
      }
    } else {
      // Create new
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: householdId, ...data }),
      })
      if (res.ok) {
        const created = await res.json()
        setItems((prev) => [...prev, created])
      }
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/inventory/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id))
    }
  }

  const handleQuickAdd = async (location: InventoryLocation) => {
    if (!quickAddValue.trim()) return
    setQuickAdding(true)
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: householdId,
          display_name: quickAddValue.trim(),
          location,
        }),
      })
      if (res.ok) {
        const created = await res.json()
        setItems((prev) => [...prev, created])
        setQuickAddValue('')
        setQuickAddLocation(null)
      }
    } finally {
      setQuickAdding(false)
    }
  }

  const openAddDialog = () => {
    setEditingItem(null)
    setDialogOpen(true)
  }

  const openEditDialog = (item: InventoryItem) => {
    setEditingItem(item)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} item{items.length !== 1 ? 's' : ''} across {Object.keys(grouped).length} {groupBy === 'location' ? 'location' : 'categor'}
            {Object.keys(grouped).length !== 1 ? (groupBy === 'location' ? 's' : 'ies') : (groupBy === 'location' ? '' : 'y')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Group toggle */}
          <div className="flex border rounded-md text-sm overflow-hidden">
            <button
              className={`px-3 py-1.5 ${groupBy === 'location' ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'}`}
              onClick={() => setGroupBy('location')}
            >
              Location
            </button>
            <button
              className={`px-3 py-1.5 ${groupBy === 'category' ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'}`}
              onClick={() => setGroupBy('category')}
            >
              Category
            </button>
          </div>
          <Button onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search inventory..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-muted-foreground text-lg">No inventory items yet.</p>
          <p className="text-muted-foreground text-sm mt-1">
            Add items manually or transfer them from a shopping list.
          </p>
        </div>
      )}

      {/* No search results */}
      {items.length > 0 && filteredItems.length === 0 && search && (
        <div className="py-8 text-center">
          <p className="text-muted-foreground">No items match &ldquo;{search}&rdquo;</p>
        </div>
      )}

      {/* Grouped sections */}
      {sectionKeys.map((key) => (
        <div key={key}>
          <div className="flex items-center justify-between py-2">
            <h2 className="text-sm font-semibold flex items-center gap-1">
              {getSectionLabel(key)}
              <span className="text-xs font-normal text-muted-foreground ml-1">
                {grouped[key].length} item{grouped[key].length !== 1 ? 's' : ''}
              </span>
            </h2>
            {groupBy === 'location' && (
              <button
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setQuickAddLocation(quickAddLocation === key ? null : key as InventoryLocation)
                  setQuickAddValue('')
                }}
              >
                + Quick add
              </button>
            )}
          </div>

          {/* Quick add input */}
          {quickAddLocation === key && (
            <div className="flex gap-2 mb-2">
              <Input
                placeholder={`Add to ${getSectionLabel(key)}...`}
                value={quickAddValue}
                onChange={(e) => setQuickAddValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd(key as InventoryLocation)}
                autoFocus
              />
              <Button
                size="sm"
                onClick={() => handleQuickAdd(key as InventoryLocation)}
                disabled={quickAdding || !quickAddValue.trim()}
              >
                Add
              </Button>
            </div>
          )}

          <div className="border rounded-lg overflow-hidden">
            {grouped[key].map((item) => (
              <InventoryItemRow
                key={item.id}
                item={item}
                onQuantityChange={handleQuantityChange}
                onClick={openEditDialog}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Dialog */}
      <InventoryItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editingItem}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/inventory/inventory-list.tsx
git commit -m "feat(inventory): add main inventory list component with grouping and search"
```

### Task 9: Inventory Page (Server Component)

**Files:**
- Modify: `src/app/(dashboard)/inventory/page.tsx`

- [ ] **Step 1: Replace the stub page with the server component**

Replace the entire contents of `src/app/(dashboard)/inventory/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { InventoryList } from '@/components/features/inventory/inventory-list'

export default async function InventoryPage() {
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

  const { data: items } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('household_id', householdId)
    .order('display_name', { ascending: true })

  return <InventoryList items={items || []} householdId={householdId} />
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\\(dashboard\\)/inventory/page.tsx
git commit -m "feat(inventory): replace stub page with server component"
```

---

## Chunk 3: Shopping → Inventory Integration

### Task 10: Add to Inventory Review Dialog

**Files:**
- Create: `src/components/features/inventory/add-to-inventory-review.tsx`

- [ ] **Step 1: Write the review dialog component**

This dialog shows completed shopping items with location/category pills, pre-filled from `inventory_defaults`. The user can adjust locations and confirm.

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { normalizeName } from '@/lib/utils/ingredients'
import { INVENTORY_LOCATIONS, INVENTORY_CATEGORIES } from '@/types/inventory'
import type { InventoryLocation, InventoryDefault, BulkInventoryItem } from '@/types/inventory'

interface ShoppingItemForReview {
  id: string
  title: string
  quantity: number | null
  unit: string | null
}

interface ReviewItem extends ShoppingItemForReview {
  normalizedName: string
  location: InventoryLocation | ''
  category: string | null
  isNew: boolean
}

interface AddToInventoryReviewProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: ShoppingItemForReview[]
  householdId: string
  onComplete: () => void
}

export function AddToInventoryReview({
  open,
  onOpenChange,
  items,
  householdId,
  onComplete,
}: AddToInventoryReviewProps) {
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open || items.length === 0) return
    loadDefaults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items, householdId])

  const loadDefaults = async () => {
    setLoading(true)
    const normalized = items.map((i) => ({
      ...i,
      normalizedName: normalizeName(i.title),
    }))

    // Fetch defaults for all normalized names
    const names = normalized.map((i) => i.normalizedName).join(',')
    const res = await fetch(
      `/api/inventory/defaults?householdId=${householdId}&names=${encodeURIComponent(names)}`
    )
    const defaults: InventoryDefault[] = res.ok ? await res.json() : []

    const defaultsMap = new Map(defaults.map((d) => [d.normalized_name, d]))

    setReviewItems(
      normalized.map((item) => {
        const def = defaultsMap.get(item.normalizedName)
        return {
          ...item,
          location: (def?.location as InventoryLocation) || '',
          category: def?.category || null,
          isNew: !def,
        }
      })
    )
    setLoading(false)
  }

  const updateItem = (index: number, field: 'location' | 'category', value: string) => {
    setReviewItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: value === 'none' ? null : (value || null) } : item
      )
    )
  }

  const allHaveLocation = reviewItems.every((i) => i.location)

  const handleSubmit = async () => {
    if (!allHaveLocation) return
    setSubmitting(true)
    try {
      const bulkItems: BulkInventoryItem[] = reviewItems.map((item) => ({
        display_name: item.title,
        name: item.normalizedName,
        quantity: item.quantity,
        unit: item.unit,
        location: item.location as InventoryLocation,
        category: item.category,
      }))

      const res = await fetch('/api/inventory/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: householdId, items: bulkItems }),
      })

      if (res.ok) {
        toast.success(`Added ${reviewItems.length} item${reviewItems.length !== 1 ? 's' : ''} to inventory`)
        onComplete()
        onOpenChange(false)
      } else {
        toast.error('Failed to add items to inventory')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add to Inventory</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Assign locations for each item. Previously used locations are pre-filled.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-1 py-2">
          {loading ? (
            <div className="py-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : (
            reviewItems.map((item, index) => (
              <div key={item.id} className="py-3 px-2 border-b last:border-b-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm flex items-center gap-2">
                      {item.title}
                      {item.isNew && (
                        <Badge variant="outline" className="text-[10px] py-0 border-primary text-primary">
                          NEW
                        </Badge>
                      )}
                    </div>
                    {(item.quantity != null || item.unit) && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {item.quantity}{item.unit ? ` ${item.unit}` : ''}
                      </div>
                    )}
                    {!item.isNew && item.location && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">remembered from last time</div>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Select
                      value={item.location}
                      onValueChange={(v) => updateItem(index, 'location', v)}
                    >
                      <SelectTrigger className={`h-8 w-[130px] text-xs ${!item.location ? 'border-dashed border-primary' : ''}`}>
                        <SelectValue placeholder="Location..." />
                      </SelectTrigger>
                      <SelectContent>
                        {INVENTORY_LOCATIONS.map((loc) => (
                          <SelectItem key={loc.value} value={loc.value}>
                            {loc.icon} {loc.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={item.category || ''}
                      onValueChange={(v) => updateItem(index, 'category', v)}
                    >
                      <SelectTrigger className="h-8 w-[110px] text-xs">
                        <SelectValue placeholder="Category..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {INVENTORY_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat.charAt(0).toUpperCase() + cat.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting || !allHaveLocation || loading}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Add {reviewItems.length} item{reviewItems.length !== 1 ? 's' : ''} to Inventory
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/inventory/add-to-inventory-review.tsx
git commit -m "feat(inventory): add shopping-to-inventory review dialog"
```

### Task 11: Add to Inventory Button

**Files:**
- Create: `src/components/features/inventory/add-to-inventory-button.tsx`

- [ ] **Step 1: Write the button component**

This is rendered inside the shopping list detail. It shows when ≥1 item is completed, and opens the review dialog.

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Package, Check } from 'lucide-react'
import { AddToInventoryReview } from './add-to-inventory-review'

interface ShoppingItem {
  id: string
  title: string
  quantity: number | null
  unit: string | null
  status: string
}

interface AddToInventoryButtonProps {
  items: ShoppingItem[]
  householdId: string
}

export function AddToInventoryButton({ items, householdId }: AddToInventoryButtonProps) {
  const [reviewOpen, setReviewOpen] = useState(false)
  const [added, setAdded] = useState(false)

  const completedItems = items.filter((i) => i.status === 'completed')

  if (completedItems.length === 0) return null

  if (added) {
    return (
      <div className="pt-3 border-t mt-4">
        <Button variant="outline" disabled className="w-full">
          <Check className="h-4 w-4 mr-2" />
          Added to Inventory
        </Button>
      </div>
    )
  }

  return (
    <>
      <div className="pt-3 border-t mt-4">
        <Button
          className="w-full"
          onClick={() => setReviewOpen(true)}
        >
          <Package className="h-4 w-4 mr-2" />
          Add {completedItems.length} item{completedItems.length !== 1 ? 's' : ''} to Inventory
        </Button>
        <p className="text-center text-xs text-muted-foreground mt-1">
          Checked-off items will be added to your inventory
        </p>
      </div>

      <AddToInventoryReview
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        items={completedItems}
        householdId={householdId}
        onComplete={() => setAdded(true)}
      />
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/inventory/add-to-inventory-button.tsx
git commit -m "feat(inventory): add 'Add to Inventory' button component"
```

### Task 12: Integrate Button into Shopping List Detail

**Files:**
- Modify: `src/components/features/shopping/shopping-list-detail.tsx`
- Modify: `src/app/(dashboard)/shopping/[id]/page.tsx`

- [ ] **Step 1: Pass householdId to the shopping list detail component**

The shopping list detail needs the `householdId` to pass to the inventory button. Modify the page server component at `src/app/(dashboard)/shopping/[id]/page.tsx` to fetch and pass `householdId`.

Replace the full page content:

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

  return <ShoppingListDetail list={list as any} householdId={list.household_id} />
}
```

- [ ] **Step 2: Add the button to the shopping list detail component**

In `src/components/features/shopping/shopping-list-detail.tsx`:

1. Add import at the top:
```typescript
import { AddToInventoryButton } from '@/components/features/inventory/add-to-inventory-button'
```

2. Update the `ShoppingListDetailProps` interface to accept `householdId`:
```typescript
interface ShoppingListDetailProps {
  list: {
    id: string
    title: string
    todo_items: ShoppingItem[]
  }
  householdId: string
}
```

3. Update the component function signature:
```typescript
export function ShoppingListDetail({ list: initialList, householdId }: ShoppingListDetailProps) {
```

4. Add the `AddToInventoryButton` at the bottom of the JSX, after the completed items section (before the closing `</div>` of `mx-auto max-w-2xl`):
```typescript
      <AddToInventoryButton items={items} householdId={householdId} />
```

- [ ] **Step 3: Commit**

```bash
git add src/app/\\(dashboard\\)/shopping/\\[id\\]/page.tsx src/components/features/shopping/shopping-list-detail.tsx
git commit -m "feat(inventory): integrate 'Add to Inventory' button into shopping list"
```

### Task 13: Smoke Test

- [ ] **Step 1: Verify the app builds**

Run: `npx next build 2>&1 | tail -30`

If there are type errors related to Supabase generated types not knowing about `inventory_items`/`inventory_defaults` tables, the fix is to either:
- Run `supabase gen types typescript --local > src/types/database.ts` (if local Supabase is running)
- Or temporarily bypass by using `.from('inventory_items' as any)` in the API routes

Expected: Build succeeds, or only type errors related to missing generated types (not logic errors).

- [ ] **Step 2: Verify dev server starts**

Run: `npx next dev` (manually verify in browser)

Check:
1. Navigate to `/inventory` — should show empty state
2. Click "Add Item" — dialog should open with all fields
3. Navigate to a shopping list — "Add to Inventory" button should appear when items are checked

- [ ] **Step 3: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix(inventory): build fixes for inventory feature"
```
