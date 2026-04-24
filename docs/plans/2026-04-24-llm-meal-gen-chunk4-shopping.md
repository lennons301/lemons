# LLM Meal Generation — Chunk 4: Shopping Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the loop on LLM-assisted meal planning — generate a packet-rounded shopping list alongside the accepted plan, show a live preview in the drawer, and expose household-level packet-size overrides.

**Architecture:** A new `pack-round.ts` utility layers on top of the existing `aggregate-ingredients` pipeline. A shared `shopping-for-drafts.ts` helper takes a conversation id, pulls drafts + recipe ingredients + staples + packet sizes, and returns the aggregated rounded list. A new `/shopping-preview` endpoint drives the drawer's live preview; `acceptConversation` reuses the same helper to persist the list as a `todo_lists` row with `list_type='shopping'` on accept. `check_packet_sizes` tool prefers household overrides over globals.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase, Anthropic SDK, Vitest.

**Spec:** `docs/plans/2026-04-20-llm-meal-generation-design.md`
**Chunk 1–3 (merged):** foundation, library, HTTP, UI

---

## Scope

### In This Chunk

- `pack-round.ts` utility: round each aggregated line up to the nearest packet; attach `{required_qty, packed_qty, waste_qty, pack_size}`; prefer household-override packet sizes over globals; fall back to single-pack-multiples when needed.
- `check_packet_sizes` tool: prefer household-override rows over globals in the model's view (chunk 2a flag).
- `shopping-for-drafts.ts` helper: shared between preview and accept flows.
- `GET /api/meal-plans/generate/[id]/shopping-preview` — returns current preview for a conversation.
- `/api/packet-sizes` — list, create, update, delete household overrides.
- `acceptConversation` extended to transactionally create a `todo_lists` (type=shopping) row + its `todo_items`, with packet metadata per item.
- `ShoppingPreview` component: collapsible card in the drawer showing the aggregated list + waste annotations.
- `AcceptPlanModal` shows the shopping-item count alongside the plan-entry count.
- One integration test covering preview + accept with shopping persistence.

### Deferred

- **Conflict detection on accept** (overlap with existing `meal_plan_entries`) — chunk 5 (UI polish).
- **Draft click → edit via existing `AddMealDialog`** — chunk 5.
- **Relative timestamps in Recent dropdown** — chunk 5.
- **Batch `/api/recipes?ids=...` endpoint** — chunk 5.
- **Typed `AcceptPreconditionError`** — chunk 5.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/utils/pack-round.ts` | Round a single aggregated quantity up to a packet choice; return `{required, packed, waste, pack_size}` |
| `src/lib/utils/pack-round.test.ts` | Unit tests: exact fit, half-pack waste, multi-pack needed, no packet data → pass-through |
| `src/lib/ai/meal-plan/shopping-for-drafts.ts` | Shared helper: `buildShoppingFromDrafts(supabase, conversationId)` → `{ items, totals }` |
| `src/lib/ai/meal-plan/shopping-for-drafts.test.ts` | Unit tests with fake Supabase |
| `src/app/api/meal-plans/generate/[id]/shopping-preview/route.ts` | GET route |
| `src/app/api/packet-sizes/route.ts` | GET (list globals + household) + POST (create household override) |
| `src/app/api/packet-sizes/[id]/route.ts` | PATCH + DELETE on a household-scoped override |
| `src/components/features/meal-plan/meal-gen/shopping-preview.tsx` | Collapsible card component |

### Modified Files

| File | Changes |
|------|---------|
| `src/lib/ai/meal-plan/tools/check-packet-sizes.ts` | Prefer household override rows when both exist for the same `(ingredient_name, locale, pack_quantity, pack_unit)` |
| `src/lib/ai/meal-plan/accept.ts` | After creating `meal_plan_entries`, call `buildShoppingFromDrafts` and persist as a `todo_lists` + `todo_items`; return shopping_list_id alongside inserted_ids |
| `src/lib/ai/meal-plan/accept.test.ts` | Extend to assert shopping-list creation |
| `src/components/features/meal-plan/meal-gen/use-meal-gen-chat.ts` | Add `shoppingPreview` state + `refreshPreview` action; refresh when drafts change |
| `src/components/features/meal-plan/meal-gen/use-meal-gen-chat.test.tsx` | Extend with preview fetch test |
| `src/components/features/meal-plan/meal-gen/chat-drawer.tsx` | Mount `ShoppingPreview` below the message list when ≥3 drafts exist |
| `src/components/features/meal-plan/meal-gen/accept-plan-modal.tsx` | Add `shoppingItemCount` prop; show count line in description |

---

## Conventions

- **Packet sizes on `todo_items.metadata`** jsonb: `{ required_qty, packed_qty, waste_qty, pack_size: { quantity, unit } }`. Column was added in chunk 1's migration 00018.
- **Shopping list type** is `todo_lists.list_type = 'shopping'`. Already used by existing `/api/shopping/generate` flow — reuse that schema exactly.
- **Preference order for packet sizes:** household override wins over global default for the same `ingredient_name` + `locale`. When multiple packet sizes exist for an ingredient (e.g. 500g and 1kg carrots), prefer the smallest pack that covers the required quantity.
- **All HTTP routes under `/api/packet-sizes` require auth**, but do NOT require the meal-gen flag — these are a shared household-settings feature.

---

## Tasks

### Task 1: `pack-round` utility

**Files:**
- Create: `src/lib/utils/pack-round.ts`
- Create: `src/lib/utils/pack-round.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/pack-round.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { roundToPacket, type PacketChoice } from './pack-round'

const carrot1kg: PacketChoice = { pack_quantity: 1, pack_unit: 'kg', is_default: true, is_household: false }
const carrot500g: PacketChoice = { pack_quantity: 500, pack_unit: 'g', is_default: false, is_household: false }

describe('roundToPacket', () => {
  it('picks the smallest pack that covers required quantity (same unit)', () => {
    const result = roundToPacket({ name: 'carrot', quantity: 600, unit: 'g' }, [carrot500g, carrot1kg])
    expect(result.packed_qty).toBe(1000)
    expect(result.pack_size).toEqual({ quantity: 1, unit: 'kg' })
    expect(result.waste_qty).toBeCloseTo(400)
  })

  it('returns exact fit with zero waste', () => {
    const result = roundToPacket({ name: 'carrot', quantity: 1, unit: 'kg' }, [carrot500g, carrot1kg])
    expect(result.packed_qty).toBe(1)
    expect(result.waste_qty).toBe(0)
  })

  it('uses multiple packs of smallest size when no single pack fits', () => {
    const result = roundToPacket({ name: 'carrot', quantity: 1200, unit: 'g' }, [carrot500g])
    // Three 500g packs = 1500g; waste = 300g
    expect(result.packed_qty).toBe(1500)
    expect(result.pack_size).toEqual({ quantity: 500, unit: 'g' })
    expect(result.pack_count).toBe(3)
  })

  it('prefers household-override rows over globals', () => {
    const globalOnion: PacketChoice = { pack_quantity: 3, pack_unit: 'ct', is_default: true, is_household: false }
    const householdOnion: PacketChoice = { pack_quantity: 5, pack_unit: 'ct', is_default: true, is_household: true }
    const result = roundToPacket({ name: 'onion', quantity: 2, unit: 'ct' }, [globalOnion, householdOnion])
    expect(result.pack_size).toEqual({ quantity: 5, unit: 'ct' })
  })

  it('passes through unchanged when no packet data matches', () => {
    const result = roundToPacket({ name: 'dragonfruit', quantity: 3, unit: 'ct' }, [])
    expect(result.required_qty).toBe(3)
    expect(result.packed_qty).toBe(3)
    expect(result.waste_qty).toBe(0)
    expect(result.pack_size).toBeNull()
    expect(result.pack_count).toBe(0)
  })

  it('passes through when quantity is null (unknown)', () => {
    const result = roundToPacket({ name: 'salt', quantity: null, unit: null }, [])
    expect(result.packed_qty).toBeNull()
    expect(result.pack_size).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/utils/pack-round.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/utils/pack-round.ts`:

```typescript
import { convertUnit, UNIT_TO_BASE } from './units'

export interface PacketChoice {
  pack_quantity: number
  pack_unit: string
  is_default: boolean
  is_household: boolean
}

export interface PackRoundInput {
  name: string
  quantity: number | null
  unit: string | null
}

export interface PackRoundResult {
  name: string
  required_qty: number | null
  required_unit: string | null
  packed_qty: number | null
  packed_unit: string | null
  waste_qty: number
  pack_size: { quantity: number; unit: string } | null
  pack_count: number
}

function compatibleInSameBucket(a: string | null, b: string): boolean {
  if (!a) return false
  if (a === b) return true
  const aInfo = UNIT_TO_BASE[a]
  const bInfo = UNIT_TO_BASE[b]
  if (!aInfo || !bInfo) return false
  return aInfo.group === bInfo.group
}

function toSameUnit(quantity: number, from: string, to: string): number | null {
  if (from === to) return quantity
  return convertUnit(quantity, from, to)
}

/**
 * Round an aggregated shopping line up to a whole-packet purchase.
 *
 * Selection rules:
 * 1. Filter packs to those with the same unit-group as the required unit.
 * 2. Prefer household-override packs over globals.
 * 3. If any single pack is ≥ required, pick the smallest such pack.
 * 4. Otherwise, use multiple copies of the smallest available pack.
 * 5. If no usable packs, pass through unchanged.
 */
export function roundToPacket(input: PackRoundInput, packs: PacketChoice[]): PackRoundResult {
  if (input.quantity == null) {
    return {
      name: input.name,
      required_qty: null,
      required_unit: input.unit,
      packed_qty: null,
      packed_unit: input.unit,
      waste_qty: 0,
      pack_size: null,
      pack_count: 0,
    }
  }

  const candidates = packs.filter((p) => compatibleInSameBucket(input.unit, p.pack_unit))
  if (candidates.length === 0) {
    return {
      name: input.name,
      required_qty: input.quantity,
      required_unit: input.unit,
      packed_qty: input.quantity,
      packed_unit: input.unit,
      waste_qty: 0,
      pack_size: null,
      pack_count: 0,
    }
  }

  // Split household vs global; prefer household.
  const household = candidates.filter((p) => p.is_household)
  const usable = household.length > 0 ? household : candidates

  // Normalize each candidate to the required unit so we can compare.
  const comparable = usable
    .map((p) => {
      const qtyInRequired = input.unit ? toSameUnit(p.pack_quantity, p.pack_unit, input.unit) : null
      return { pack: p, qty: qtyInRequired }
    })
    .filter((c): c is { pack: PacketChoice; qty: number } => c.qty !== null && c.qty > 0)

  if (comparable.length === 0) {
    return {
      name: input.name,
      required_qty: input.quantity,
      required_unit: input.unit,
      packed_qty: input.quantity,
      packed_unit: input.unit,
      waste_qty: 0,
      pack_size: null,
      pack_count: 0,
    }
  }

  // Sort ascending by qty-in-required-unit.
  comparable.sort((a, b) => a.qty - b.qty)

  // Try to find a single pack ≥ required.
  const covering = comparable.find((c) => c.qty >= input.quantity!)

  if (covering) {
    return {
      name: input.name,
      required_qty: input.quantity,
      required_unit: input.unit,
      packed_qty: covering.qty,
      packed_unit: input.unit,
      waste_qty: Math.max(0, covering.qty - input.quantity),
      pack_size: { quantity: covering.pack.pack_quantity, unit: covering.pack.pack_unit },
      pack_count: 1,
    }
  }

  // No single pack covers. Use multiples of the smallest pack.
  const smallest = comparable[0]
  const count = Math.ceil(input.quantity / smallest.qty)
  const totalQty = smallest.qty * count
  return {
    name: input.name,
    required_qty: input.quantity,
    required_unit: input.unit,
    packed_qty: totalQty,
    packed_unit: input.unit,
    waste_qty: Math.max(0, totalQty - input.quantity),
    pack_size: { quantity: smallest.pack.pack_quantity, unit: smallest.pack.pack_unit },
    pack_count: count,
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/utils/pack-round.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/pack-round.ts src/lib/utils/pack-round.test.ts
git commit -m "feat(utils): add pack-round utility for shopping packet rounding"
```

---

### Task 2: `check_packet_sizes` — prefer household overrides

**Files:**
- Modify: `src/lib/ai/meal-plan/tools/check-packet-sizes.ts`
- Modify: `src/lib/ai/meal-plan/tools/check-packet-sizes.test.ts`

- [ ] **Step 1: Extend the test**

Open `src/lib/ai/meal-plan/tools/check-packet-sizes.test.ts`. Append a new `it()`:

```typescript
  it('prefers household override packs over globals for the same ingredient', async () => {
    const ctx = fakeContext([
      { ingredient_name: 'onion', pack_quantity: 3, pack_unit: 'ct', is_default: true, household_id: null },
      { ingredient_name: 'onion', pack_quantity: 5, pack_unit: 'ct', is_default: true, household_id: 'h1' },
    ])
    const result = await checkPacketSizes(ctx, { ingredient_names: ['onion'] })
    expect(result.content).toEqual([
      {
        name: 'onion',
        packs: [
          { quantity: 5, unit: 'ct', is_default: true },
        ],
      },
    ])
  })
```

You'll also need to update `fakeContext` to pass `household_id` through (accept the extra field in rows). Update `fakeContext` signature to accept rows with optional `household_id`; the existing rows in the other tests should stay functional (just add `household_id: null` to them).

Replace the existing two tests' row definitions to include `household_id: null` for all existing rows:

```typescript
  it('groups rows by ingredient and returns compact output', async () => {
    const ctx = fakeContext([
      { ingredient_name: 'carrot', pack_quantity: 1, pack_unit: 'kg', is_default: true, household_id: null },
      { ingredient_name: 'carrot', pack_quantity: 500, pack_unit: 'g', is_default: false, household_id: null },
      { ingredient_name: 'onion', pack_quantity: 3, pack_unit: 'ct', is_default: true, household_id: null },
    ])
    // ... rest unchanged
  })
```

- [ ] **Step 2: Run the test to verify failures**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/check-packet-sizes.test.ts`
Expected: 1 new test fails ("prefers household override…"), 2 existing tests still pass.

- [ ] **Step 3: Update the implementation**

Open `src/lib/ai/meal-plan/tools/check-packet-sizes.ts`. Replace the select + grouping logic:

```typescript
import type { ToolContext, ToolResult } from '../types'

export interface CheckPacketSizesInput {
  ingredient_names: string[]
}

export interface PacketSizesOutput {
  name: string
  packs: Array<{ quantity: number; unit: string; is_default: boolean }>
}

export async function checkPacketSizes(
  ctx: ToolContext,
  input: CheckPacketSizesInput,
): Promise<ToolResult<PacketSizesOutput[]>> {
  const names = input.ingredient_names.map((n) => n.trim().toLowerCase()).filter(Boolean)
  if (names.length === 0) {
    return { content: [] }
  }

  const { data, error } = await ctx.supabase
    .from('packet_sizes')
    .select('ingredient_name, pack_quantity, pack_unit, is_default, household_id')
    .in('ingredient_name', names)
    .order('is_default', { ascending: false })

  if (error) {
    return { content: [], is_error: true }
  }

  const byName = new Map<string, PacketSizesOutput>()
  for (const name of names) {
    byName.set(name, { name, packs: [] })
  }

  // Group raw rows by ingredient_name.
  const raw = new Map<string, typeof data>()
  for (const row of data ?? []) {
    if (!raw.has(row.ingredient_name)) raw.set(row.ingredient_name, [])
    raw.get(row.ingredient_name)!.push(row)
  }

  for (const [name, rows] of raw) {
    const target = byName.get(name)
    if (!target) continue
    const hasHouseholdRows = rows.some((r) => r.household_id !== null)
    const visible = hasHouseholdRows ? rows.filter((r) => r.household_id !== null) : rows
    for (const row of visible) {
      target.packs.push({
        quantity: Number(row.pack_quantity),
        unit: row.pack_unit,
        is_default: row.is_default,
      })
    }
  }

  return { content: [...byName.values()] }
}
```

- [ ] **Step 4: Run tests**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/check-packet-sizes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/tools/check-packet-sizes.ts src/lib/ai/meal-plan/tools/check-packet-sizes.test.ts
git commit -m "feat(meal-gen): check_packet_sizes prefers household overrides over globals"
```

---

### Task 3: `shopping-for-drafts` helper

Shared between the preview endpoint and the accept flow.

**Files:**
- Create: `src/lib/ai/meal-plan/shopping-for-drafts.ts`
- Create: `src/lib/ai/meal-plan/shopping-for-drafts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/shopping-for-drafts.test.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { buildShoppingFromDrafts } from './shopping-for-drafts'

function fakeSupabase(tables: Record<string, any>) {
  return {
    from: vi.fn((name: string) => {
      if (!tables[name]) throw new Error(`no fake for ${name}`)
      return tables[name]
    }),
  } as any
}

describe('buildShoppingFromDrafts', () => {
  it('returns empty items when conversation has no drafts', async () => {
    const supabase = fakeSupabase({
      meal_gen_conversations: {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { id: 'c1', household_id: 'h1' }, error: null }),
          }),
        }),
      },
      meal_gen_drafts: {
        select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
      },
      recipes: { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) },
      household_staples: {
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      },
      packet_sizes: {
        select: () => ({
          or: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
        }),
      },
    })
    const result = await buildShoppingFromDrafts(supabase, 'c1')
    expect(result.items).toEqual([])
    expect(result.totals.line_count).toBe(0)
  })

  it('aggregates recipe ingredients across drafts and rounds to packets', async () => {
    const supabase = fakeSupabase({
      meal_gen_conversations: {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { id: 'c1', household_id: 'h1' }, error: null }),
          }),
        }),
      },
      meal_gen_drafts: {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({
              data: [
                { id: 'd1', date: '2026-04-22', meal_type: 'dinner', source: 'recipe', recipe_id: 'r1', custom_ingredients: null, servings: 4, inventory_item_id: null, custom_name: null },
                { id: 'd2', date: '2026-04-23', meal_type: 'dinner', source: 'recipe', recipe_id: 'r1', custom_ingredients: null, servings: 4, inventory_item_id: null, custom_name: null },
              ],
              error: null,
            }),
          }),
        }),
      },
      recipes: {
        select: () => ({
          in: () => Promise.resolve({
            data: [
              {
                id: 'r1',
                servings: 4,
                recipe_ingredients: [
                  { name: 'carrot', quantity: 300, unit: 'g' },
                ],
              },
            ],
            error: null,
          }),
        }),
      },
      household_staples: {
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      },
      packet_sizes: {
        select: () => ({
          or: () => ({
            in: () => Promise.resolve({
              data: [
                { ingredient_name: 'carrot', pack_quantity: 500, pack_unit: 'g', is_default: false, household_id: null },
                { ingredient_name: 'carrot', pack_quantity: 1, pack_unit: 'kg', is_default: true, household_id: null },
              ],
              error: null,
            }),
          }),
        }),
      },
    })

    const result = await buildShoppingFromDrafts(supabase, 'c1')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].name).toBe('carrot')
    expect(result.items[0].required_qty).toBe(600)
    expect(result.items[0].packed_qty).toBe(1000)
    expect(result.items[0].pack_size).toEqual({ quantity: 1, unit: 'kg' })
    expect(result.totals.waste_qty_total).toBeCloseTo(400)
  })

  it('includes custom_with_ingredients entries as ingredient sources', async () => {
    const supabase = fakeSupabase({
      meal_gen_conversations: {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { id: 'c1', household_id: 'h1' }, error: null }),
          }),
        }),
      },
      meal_gen_drafts: {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({
              data: [
                {
                  id: 'd1',
                  date: '2026-04-22',
                  meal_type: 'dinner',
                  source: 'custom_with_ingredients',
                  recipe_id: null,
                  custom_ingredients: [{ name: 'tortilla', quantity: 8, unit: 'ct' }],
                  servings: 4,
                  inventory_item_id: null,
                  custom_name: 'DIY tacos',
                },
              ],
              error: null,
            }),
          }),
        }),
      },
      recipes: { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) },
      household_staples: {
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      },
      packet_sizes: {
        select: () => ({ or: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
      },
    })

    const result = await buildShoppingFromDrafts(supabase, 'c1')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].name).toBe('tortilla')
  })

  it('returns null when conversation not found', async () => {
    const supabase = fakeSupabase({
      meal_gen_conversations: {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      },
    })
    const result = await buildShoppingFromDrafts(supabase, 'missing')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/shopping-for-drafts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/shopping-for-drafts.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { aggregateIngredients, type MealPlanIngredient } from '@/lib/utils/aggregate-ingredients'
import { roundToPacket, type PacketChoice, type PackRoundResult } from '@/lib/utils/pack-round'

export interface ShoppingLine extends PackRoundResult {
  is_staple: boolean
}

export interface ShoppingTotals {
  line_count: number
  waste_qty_total: number
  pack_total: number
}

export interface ShoppingForDraftsResult {
  items: ShoppingLine[]
  totals: ShoppingTotals
}

export async function buildShoppingFromDrafts(
  supabase: SupabaseClient<Database>,
  conversationId: string,
): Promise<ShoppingForDraftsResult | null> {
  const { data: conversation } = await supabase
    .from('meal_gen_conversations')
    .select('id, household_id')
    .eq('id', conversationId)
    .maybeSingle()
  if (!conversation) return null

  const { data: drafts } = await supabase
    .from('meal_gen_drafts')
    .select('id, date, meal_type, source, recipe_id, inventory_item_id, custom_name, custom_ingredients, servings')
    .eq('conversation_id', conversationId)
    .order('date', { ascending: true })

  const draftRows = drafts ?? []

  // Collect recipe ids to fetch their ingredients.
  const recipeIds = Array.from(
    new Set(draftRows.filter((d) => d.source === 'recipe' && d.recipe_id).map((d) => d.recipe_id as string)),
  )

  const [recipesRes, staplesRes] = await Promise.all([
    recipeIds.length > 0
      ? supabase
          .from('recipes')
          .select('id, servings, recipe_ingredients(name, quantity, unit)')
          .in('id', recipeIds)
      : Promise.resolve({ data: [] as Array<{ id: string; servings: number; recipe_ingredients: Array<{ name: string | null; quantity: number | null; unit: string | null }> }>, error: null }),
    supabase.from('household_staples').select('name, default_quantity, default_unit').eq('household_id', conversation.household_id),
  ])

  const recipeById = new Map<string, { servings: number; ingredients: Array<{ name: string | null; quantity: number | null; unit: string | null }> }>()
  for (const r of recipesRes.data ?? []) {
    recipeById.set(r.id, {
      servings: r.servings,
      ingredients: (r.recipe_ingredients ?? []) as Array<{ name: string | null; quantity: number | null; unit: string | null }>,
    })
  }

  // Build the scaled ingredient list.
  const items: MealPlanIngredient[] = []
  for (const d of draftRows) {
    if (d.source === 'recipe' && d.recipe_id) {
      const r = recipeById.get(d.recipe_id)
      if (!r) continue
      for (const ing of r.ingredients) {
        if (!ing.name) continue
        items.push({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          servings: d.servings,
          recipeServings: r.servings || 1,
        })
      }
    } else if (d.source === 'custom_with_ingredients' && Array.isArray(d.custom_ingredients)) {
      for (const ing of d.custom_ingredients as Array<{ name: string; quantity: number | null; unit: string | null }>) {
        if (!ing.name) continue
        items.push({
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          servings: 1,
          recipeServings: 1,
        })
      }
    }
    // 'custom' and 'leftover' contribute nothing to the shopping list.
  }

  const aggregated = aggregateIngredients(items)

  // Collect unique ingredient names to pre-fetch packet sizes.
  const uniqueNames = Array.from(new Set(aggregated.map((a) => a.name)))

  const { data: packetRows } = uniqueNames.length > 0
    ? await supabase
        .from('packet_sizes')
        .select('ingredient_name, pack_quantity, pack_unit, is_default, household_id')
        .or(`household_id.is.null,household_id.eq.${conversation.household_id}`)
        .in('ingredient_name', uniqueNames)
    : { data: [] as Array<{ ingredient_name: string; pack_quantity: number; pack_unit: string; is_default: boolean; household_id: string | null }> }

  const packsByName = new Map<string, PacketChoice[]>()
  for (const row of packetRows ?? []) {
    const choice: PacketChoice = {
      pack_quantity: Number(row.pack_quantity),
      pack_unit: row.pack_unit,
      is_default: row.is_default,
      is_household: row.household_id !== null,
    }
    if (!packsByName.has(row.ingredient_name)) packsByName.set(row.ingredient_name, [])
    packsByName.get(row.ingredient_name)!.push(choice)
  }

  const stapleNames = new Set((staplesRes.data ?? []).map((s) => (s.name || '').toLowerCase()))

  // Round each line.
  const rounded: ShoppingLine[] = aggregated.map((line) => {
    const packs = packsByName.get(line.name) ?? []
    const r = roundToPacket(line, packs)
    return { ...r, is_staple: stapleNames.has(line.name.toLowerCase()) }
  })

  // Merge staples not yet included.
  for (const s of staplesRes.data ?? []) {
    const lcName = (s.name || '').toLowerCase()
    if (!lcName) continue
    if (rounded.some((r) => r.name.toLowerCase() === lcName)) continue
    const packs = packsByName.get(s.name) ?? []
    const r = roundToPacket({ name: s.name, quantity: s.default_quantity, unit: s.default_unit }, packs)
    rounded.push({ ...r, is_staple: true })
  }

  const totals: ShoppingTotals = {
    line_count: rounded.length,
    waste_qty_total: rounded.reduce((acc, l) => acc + (l.waste_qty || 0), 0),
    pack_total: rounded.reduce((acc, l) => acc + (l.pack_count || 0), 0),
  }

  return { items: rounded, totals }
}
```

- [ ] **Step 4: Run tests**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/shopping-for-drafts.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/shopping-for-drafts.ts src/lib/ai/meal-plan/shopping-for-drafts.test.ts
git commit -m "feat(meal-gen): add shopping-for-drafts helper (aggregate + pack-round)"
```

---

### Task 4: GET `/api/meal-plans/generate/[id]/shopping-preview`

**Files:**
- Create: `src/app/api/meal-plans/generate/[id]/shopping-preview/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/meal-plans/generate/[id]/shopping-preview/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'
import { buildShoppingFromDrafts } from '@/lib/ai/meal-plan/shopping-for-drafts'

// GET /api/meal-plans/generate/[id]/shopping-preview — packet-rounded preview
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await buildShoppingFromDrafts(supabase, id)
  if (!result) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  return NextResponse.json(result)
}
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/meal-plans/generate/\[id\]/shopping-preview/route.ts
git commit -m "feat(meal-gen): GET shopping-preview endpoint"
```

---

### Task 5: `/api/packet-sizes` CRUD

Simple household-scoped CRUD for packet-size overrides. Globals remain read-only (migration only).

**Files:**
- Create: `src/app/api/packet-sizes/route.ts`
- Create: `src/app/api/packet-sizes/[id]/route.ts`

- [ ] **Step 1: Implement `route.ts`**

Create `src/app/api/packet-sizes/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/packet-sizes?householdId=... — list globals + this household's overrides
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = request.nextUrl.searchParams.get('householdId')
  if (!householdId) return NextResponse.json({ error: 'householdId is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('packet_sizes')
    .select('id, ingredient_name, pack_quantity, pack_unit, locale, is_default, household_id, notes, created_at')
    .or(`household_id.is.null,household_id.eq.${householdId}`)
    .order('ingredient_name', { ascending: true })
    .order('is_default', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/packet-sizes — create a household override
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as {
    household_id?: string
    ingredient_name?: string
    pack_quantity?: number
    pack_unit?: string
    is_default?: boolean
    notes?: string | null
  } | null

  if (!body?.household_id || !body?.ingredient_name || !body?.pack_quantity || !body?.pack_unit) {
    return NextResponse.json(
      { error: 'household_id, ingredient_name, pack_quantity, pack_unit are required' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('packet_sizes')
    .insert({
      ingredient_name: body.ingredient_name.toLowerCase().trim(),
      pack_quantity: body.pack_quantity,
      pack_unit: body.pack_unit,
      locale: 'UK',
      is_default: body.is_default ?? true,
      household_id: body.household_id,
      notes: body.notes ?? null,
    })
    .select('*')
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to create' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Implement `[id]/route.ts`**

Create `src/app/api/packet-sizes/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// PATCH /api/packet-sizes/[id] — update a household override (global rows are read-only)
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as Partial<{
    pack_quantity: number
    pack_unit: string
    is_default: boolean
    notes: string | null
  }> | null
  if (!body) return NextResponse.json({ error: 'Body required' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.pack_quantity === 'number') update.pack_quantity = body.pack_quantity
  if (typeof body.pack_unit === 'string') update.pack_unit = body.pack_unit
  if (typeof body.is_default === 'boolean') update.is_default = body.is_default
  if (body.notes !== undefined) update.notes = body.notes

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No updatable fields provided' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('packet_sizes')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Failed to update' }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/packet-sizes/[id] — delete a household override
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('packet_sizes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/packet-sizes/route.ts src/app/api/packet-sizes/\[id\]/route.ts
git commit -m "feat(packet-sizes): add CRUD endpoints for household overrides"
```

---

### Task 6: Extend `acceptConversation` to create shopping list

**Files:**
- Modify: `src/lib/ai/meal-plan/accept.ts`
- Modify: `src/lib/ai/meal-plan/accept.test.ts`

- [ ] **Step 1: Extend the test**

Open `src/lib/ai/meal-plan/accept.test.ts`. Extend `fakeContext` to mock `todo_lists` and `todo_items` inserts, and add calls into `buildShoppingFromDrafts` internals. Simpler: mock that helper directly at module level.

At the top of the test file, after imports, add:

```typescript
const { mockBuildShopping } = vi.hoisted(() => ({
  mockBuildShopping: vi.fn(() =>
    Promise.resolve({
      items: [
        { name: 'carrot', required_qty: 600, required_unit: 'g', packed_qty: 1000, packed_unit: 'g', waste_qty: 400, pack_size: { quantity: 1, unit: 'kg' }, pack_count: 1, is_staple: false },
      ],
      totals: { line_count: 1, waste_qty_total: 400, pack_total: 1 },
    }),
  ),
}))
vi.mock('./shopping-for-drafts', () => ({ buildShoppingFromDrafts: mockBuildShopping }))
```

Then extend `fakeContext` to include `todo_lists` and `todo_items`:

```typescript
function fakeContext(params: {
  conversation: any
  drafts: any[]
  insertResult?: { data: any[]; error: any }
}) {
  const conversationFetch = vi.fn(() => Promise.resolve({ data: params.conversation, error: null }))
  const draftsFetch = vi.fn(() => Promise.resolve({ data: params.drafts, error: null }))
  const insertRows = vi.fn(() => ({
    select: vi.fn(() => Promise.resolve(params.insertResult ?? { data: [{ id: 'new-1' }], error: null })),
  }))
  const updateChain = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
  const deleteChain = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
  const listInsertSingle = vi.fn(() => Promise.resolve({ data: { id: 'tl1' }, error: null }))
  const itemsInsert = vi.fn(() => Promise.resolve({ data: null, error: null }))

  const supabase: any = {
    from: vi.fn((t: string) => {
      if (t === 'meal_gen_conversations') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: conversationFetch }) }),
          update: updateChain,
        }
      }
      if (t === 'meal_gen_drafts') {
        return {
          select: () => ({ eq: () => ({ order: draftsFetch }) }),
          delete: deleteChain,
        }
      }
      if (t === 'meal_plan_entries') {
        return { insert: insertRows }
      }
      if (t === 'todo_lists') {
        return {
          insert: () => ({
            select: () => ({ single: listInsertSingle }),
          }),
        }
      }
      if (t === 'todo_items') {
        return { insert: itemsInsert }
      }
      throw new Error('unexpected table ' + t)
    }),
  }
  return { supabase, insertRows, updateChain, listInsertSingle, itemsInsert }
}
```

Append one new test:

```typescript
  it('creates a shopping todo_list + items alongside meal_plan_entries', async () => {
    const { supabase, listInsertSingle, itemsInsert } = fakeContext({
      conversation: { id: 'c1', household_id: 'h1', status: 'active', week_start: '2026-04-20' },
      drafts: [
        { id: 'd1', date: '2026-04-22', meal_type: 'dinner', source: 'recipe', recipe_id: 'r1', inventory_item_id: null, custom_name: null, custom_ingredients: null, servings: 4, assigned_to: [], notes: null },
      ],
    })
    const result = await acceptConversation(supabase, 'c1', 'u1')
    expect(listInsertSingle).toHaveBeenCalledOnce()
    expect(itemsInsert).toHaveBeenCalledOnce()
    expect(result.shopping_list_id).toBe('tl1')
  })
```

Update the existing "promotes each draft" test to include `week_start` on the conversation row (since accept needs it for the list title):

Look for `{ id: 'c1', household_id: 'h1', status: 'active' }` in existing tests and change to `{ id: 'c1', household_id: 'h1', status: 'active', week_start: '2026-04-20' }`.

- [ ] **Step 2: Run tests to verify expected behavior**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/accept.test.ts`
Expected: FAIL — new test fails because accept doesn't yet write a shopping list.

- [ ] **Step 3: Update the implementation**

Open `src/lib/ai/meal-plan/accept.ts`. Replace with:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import { buildShoppingFromDrafts } from './shopping-for-drafts'

export interface AcceptResult {
  inserted_ids: string[]
  shopping_list_id: string | null
  shopping_item_count: number
}

export async function acceptConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  userId: string,
): Promise<AcceptResult> {
  const { data: conversation } = await supabase
    .from('meal_gen_conversations')
    .select('id, household_id, status, week_start')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conversation) throw new Error(`Conversation ${conversationId} not found`)
  if (conversation.status !== 'active') {
    throw new Error(`Conversation ${conversationId} is already ${conversation.status}`)
  }

  const { data: drafts } = await supabase
    .from('meal_gen_drafts')
    .select('id, date, meal_type, source, recipe_id, inventory_item_id, custom_name, custom_ingredients, servings, assigned_to, notes')
    .eq('conversation_id', conversationId)
    .order('date', { ascending: true })

  if (!drafts || drafts.length === 0) {
    throw new Error('Cannot accept: no drafts on this conversation')
  }

  const rows = drafts.map((d) => ({
    household_id: conversation.household_id,
    date: d.date,
    meal_type: d.meal_type,
    recipe_id: d.recipe_id,
    inventory_item_id: d.inventory_item_id,
    custom_name: d.custom_name,
    custom_ingredients: d.custom_ingredients as Json | null,
    servings: d.servings,
    assigned_to: d.assigned_to,
    created_by: userId,
    notes: d.notes,
    status: 'planned' as const,
  }))

  const { data: inserted, error: insertError } = await supabase
    .from('meal_plan_entries')
    .insert(rows)
    .select('id')

  if (insertError) throw new Error(`Failed to insert meal plan entries: ${insertError.message}`)

  // Generate the shopping list. This is best-effort — if shopping generation
  // fails we still consider the accept successful (entries exist) but return
  // shopping_list_id: null so the UI can surface a retry option.
  let shopping_list_id: string | null = null
  let shopping_item_count = 0
  try {
    const shopping = await buildShoppingFromDrafts(supabase, conversationId)
    if (shopping && shopping.items.length > 0) {
      const { data: list, error: listError } = await supabase
        .from('todo_lists')
        .insert({
          household_id: conversation.household_id,
          title: `Shopping — week of ${conversation.week_start}`,
          list_type: 'shopping',
          created_by: userId,
        })
        .select('id')
        .single()

      if (!listError && list) {
        const itemRows = shopping.items.map((item, index) => ({
          list_id: list.id,
          title: item.name,
          quantity: item.packed_qty,
          unit: item.packed_unit,
          sort_order: index,
          created_by: userId,
          metadata: {
            required_qty: item.required_qty,
            packed_qty: item.packed_qty,
            waste_qty: item.waste_qty,
            pack_size: item.pack_size,
            pack_count: item.pack_count,
            is_staple: item.is_staple,
          } as unknown as Json,
        }))
        const { error: itemsError } = await supabase.from('todo_items').insert(itemRows)
        if (!itemsError) {
          shopping_list_id = list.id
          shopping_item_count = itemRows.length
        }
      }
    }
  } catch {
    // swallow — shopping list is optional on accept
  }

  const { error: updateError } = await supabase
    .from('meal_gen_conversations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  if (updateError) {
    throw new Error(
      `meal_plan_entries inserted but failed to mark conversation accepted: ${updateError.message}`,
    )
  }

  return { inserted_ids: (inserted ?? []).map((r) => r.id), shopping_list_id, shopping_item_count }
}
```

- [ ] **Step 4: Run tests**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/accept.test.ts`
Expected: PASS (4 tests total — 3 existing + 1 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/accept.ts src/lib/ai/meal-plan/accept.test.ts
git commit -m "feat(meal-gen): accept creates shopping todo_list with packet metadata"
```

---

### Task 7: `ShoppingPreview` component

**Files:**
- Create: `src/components/features/meal-plan/meal-gen/shopping-preview.tsx`

- [ ] **Step 1: Implement**

```tsx
'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, ShoppingBasket } from 'lucide-react'

interface ShoppingLine {
  name: string
  required_qty: number | null
  required_unit: string | null
  packed_qty: number | null
  packed_unit: string | null
  waste_qty: number
  pack_size: { quantity: number; unit: string } | null
  pack_count: number
  is_staple: boolean
}

interface Totals {
  line_count: number
  waste_qty_total: number
  pack_total: number
}

interface Props {
  items: ShoppingLine[]
  totals: Totals
  loading?: boolean
}

function fmtQty(qty: number | null, unit: string | null): string {
  if (qty == null) return '—'
  const q = Number(qty).toLocaleString(undefined, { maximumFractionDigits: 2 })
  return unit ? `${q} ${unit}` : q
}

export function ShoppingPreview({ items, totals, loading }: Props) {
  const [open, setOpen] = useState(false)

  if (items.length === 0 && !loading) return null

  return (
    <div className="border-t">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <ShoppingBasket className="h-4 w-4" />
          Shopping preview
          <span className="text-xs text-muted-foreground">
            · {totals.line_count} {totals.line_count === 1 ? 'item' : 'items'}
          </span>
        </span>
        {totals.waste_qty_total > 0 ? (
          <span className="text-xs text-muted-foreground">
            ~{Math.round(totals.waste_qty_total)} leftover
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="max-h-48 overflow-auto border-t">
          {loading ? (
            <div className="p-3 text-xs text-muted-foreground italic">Updating…</div>
          ) : (
            <ul className="divide-y text-sm">
              {items.map((item, i) => (
                <li key={i} className="flex items-start justify-between gap-2 px-3 py-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span>{item.name}</span>
                      {item.is_staple ? (
                        <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">staple</span>
                      ) : null}
                    </div>
                    {item.pack_size ? (
                      <div className="text-xs text-muted-foreground">
                        {fmtQty(item.packed_qty, item.packed_unit)} from {item.pack_count}×{' '}
                        {fmtQty(item.pack_size.quantity, item.pack_size.unit)}
                        {item.waste_qty > 0
                          ? ` · ${fmtQty(item.waste_qty, item.packed_unit)} leftover`
                          : ''}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        {fmtQty(item.packed_qty, item.packed_unit)}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/features/meal-plan/meal-gen/shopping-preview.tsx
git commit -m "feat(meal-gen-ui): add ShoppingPreview collapsible card"
```

---

### Task 8: Hook + drawer wiring

Wire the preview into the chat hook and drawer.

**Files:**
- Modify: `src/components/features/meal-plan/meal-gen/use-meal-gen-chat.ts`
- Modify: `src/components/features/meal-plan/meal-gen/use-meal-gen-chat.test.tsx`
- Modify: `src/components/features/meal-plan/meal-gen/chat-drawer.tsx`

- [ ] **Step 1: Extend the hook test**

Open `src/components/features/meal-plan/meal-gen/use-meal-gen-chat.test.tsx`. Append:

```typescript
  it('refreshShoppingPreview() fetches and stores the preview', async () => {
    mockFetchSequence([
      { ok: true, body: { id: 'c1', status: 'active' } },
      {
        ok: true,
        body: {
          items: [
            { name: 'carrot', required_qty: 600, required_unit: 'g', packed_qty: 1000, packed_unit: 'g', waste_qty: 400, pack_size: { quantity: 1, unit: 'kg' }, pack_count: 1, is_staple: false },
          ],
          totals: { line_count: 1, waste_qty_total: 400, pack_total: 1 },
        },
      },
    ])
    const { result } = renderHook(() => useMealGenChat({ household_id, week_start }))
    await act(async () => { await result.current.start() })
    await act(async () => { await result.current.refreshShoppingPreview() })
    expect(result.current.shoppingPreview?.items).toHaveLength(1)
    expect(result.current.shoppingPreview?.totals.line_count).toBe(1)
  })
```

- [ ] **Step 2: Run to verify new test fails**

Run: `doppler run -- npm run test:run -- src/components/features/meal-plan/meal-gen/use-meal-gen-chat.test.tsx`
Expected: 1 new failure.

- [ ] **Step 3: Update the hook**

Open `src/components/features/meal-plan/meal-gen/use-meal-gen-chat.ts`. Add a new state and action.

Add to the state block at the top of the hook (after `const [error, setError] = useState(...)`):

```typescript
  const [shoppingPreview, setShoppingPreview] = useState<{
    items: Array<{
      name: string
      required_qty: number | null
      required_unit: string | null
      packed_qty: number | null
      packed_unit: string | null
      waste_qty: number
      pack_size: { quantity: number; unit: string } | null
      pack_count: number
      is_staple: boolean
    }>
    totals: { line_count: number; waste_qty_total: number; pack_total: number }
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
```

Add a `refreshShoppingPreview` callback (define near the other useCallback functions, e.g. after `discard`):

```typescript
  const refreshShoppingPreview = useCallback(async () => {
    if (!conversationId) return
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/meal-plans/generate/${conversationId}/shopping-preview`)
      if (!res.ok) return
      const body = await res.json()
      setShoppingPreview(body)
    } finally {
      setPreviewLoading(false)
    }
  }, [conversationId])
```

Extend the memoized return to include `shoppingPreview`, `previewLoading`, and `refreshShoppingPreview`. Full return:

```typescript
  return useMemo(
    () => ({
      conversationId,
      messages,
      drafts,
      status,
      sending,
      error,
      shoppingPreview,
      previewLoading,
      start,
      send,
      accept,
      discard,
      resume,
      reset,
      refreshShoppingPreview,
    }),
    [
      conversationId,
      messages,
      drafts,
      status,
      sending,
      error,
      shoppingPreview,
      previewLoading,
      start,
      send,
      accept,
      discard,
      resume,
      reset,
      refreshShoppingPreview,
    ],
  )
```

Also add `setShoppingPreview(null)` to `reset()`:

```typescript
  const reset = useCallback(() => {
    setConversationId(null)
    setMessages([])
    setDrafts([])
    setStatus(null)
    setError(null)
    setShoppingPreview(null)
  }, [])
```

- [ ] **Step 4: Update the drawer to auto-refresh + render**

Open `src/components/features/meal-plan/meal-gen/chat-drawer.tsx`. Add near the other imports:

```typescript
import { ShoppingPreview } from './shopping-preview'
```

After the existing effect that pushes drafts up to the grid, add an effect to refresh the preview whenever drafts change to ≥3:

```typescript
  // Refresh shopping preview when drafts change (threshold: any drafts at all,
  // matching the spec's ≥3 UI hint but keeping the fetch responsive once work starts).
  useEffect(() => {
    if (chat.drafts.length === 0) return
    void chat.refreshShoppingPreview()
  }, [chat.drafts, chat.refreshShoppingPreview])
```

Render the preview between `MessageInput` and the existing footer. Find the line `<MessageInput` and after its closing `/>`, add:

```tsx
        {chat.shoppingPreview && chat.drafts.length >= 3 ? (
          <ShoppingPreview
            items={chat.shoppingPreview.items}
            totals={chat.shoppingPreview.totals}
            loading={chat.previewLoading}
          />
        ) : null}
```

- [ ] **Step 5: Tests + build**

Run: `doppler run -- npm run test:run -- src/components/features/meal-plan/meal-gen/use-meal-gen-chat.test.tsx`
Expected: PASS (7 tests).

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/features/meal-plan/meal-gen/use-meal-gen-chat.ts src/components/features/meal-plan/meal-gen/use-meal-gen-chat.test.tsx src/components/features/meal-plan/meal-gen/chat-drawer.tsx
git commit -m "feat(meal-gen-ui): wire ShoppingPreview into chat drawer"
```

---

### Task 9: Accept modal — show shopping count

**Files:**
- Modify: `src/components/features/meal-plan/meal-gen/accept-plan-modal.tsx`
- Modify: `src/components/features/meal-plan/meal-gen/chat-drawer.tsx`

- [ ] **Step 1: Update the modal**

Replace `src/components/features/meal-plan/meal-gen/accept-plan-modal.tsx` with:

```tsx
'use client'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  draftCount: number
  shoppingItemCount?: number
  onConfirm: () => void | Promise<void>
  confirming?: boolean
}

export function AcceptPlanModal({ open, onOpenChange, draftCount, shoppingItemCount, onConfirm, confirming }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accept plan?</DialogTitle>
          <DialogDescription>
            This will create {draftCount} meal plan {draftCount === 1 ? 'entry' : 'entries'} for the target week
            {typeof shoppingItemCount === 'number' && shoppingItemCount > 0
              ? ` and a shopping list with ${shoppingItemCount} ${shoppingItemCount === 1 ? 'item' : 'items'}`
              : ''}
            .
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={confirming}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={confirming}>
            {confirming ? 'Accepting…' : 'Accept'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Update drawer to pass the count**

Open `src/components/features/meal-plan/meal-gen/chat-drawer.tsx`. Find `<AcceptPlanModal` and pass `shoppingItemCount`:

```tsx
        <AcceptPlanModal
          open={acceptOpen}
          onOpenChange={setAcceptOpen}
          draftCount={chat.drafts.length}
          shoppingItemCount={chat.shoppingPreview?.totals.line_count}
          onConfirm={handleAccept}
          confirming={accepting}
        />
```

- [ ] **Step 3: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/features/meal-plan/meal-gen/accept-plan-modal.tsx src/components/features/meal-plan/meal-gen/chat-drawer.tsx
git commit -m "feat(meal-gen-ui): accept modal shows shopping item count"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full suite**

Run: `doppler run -- npm run test:run`
Expected: all pass (previous baseline + new tests from tasks 1, 2, 3, 6, 8).

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Lint on touched areas**

Run:
```
doppler run -- npm run lint 2>&1 | awk '/meal-gen|pack-round|shopping-preview|shopping-for-drafts|packet-sizes/{file=$0; next} /error|warning/{if(file) print file": "$0}' | head -20
```
Expected: no error-level output in the new/changed files.

- [ ] **Step 4: Route inventory**

Run: `ls src/app/api/packet-sizes/ src/app/api/packet-sizes/\[id\]/ src/app/api/meal-plans/generate/\[id\]/shopping-preview/`
Expected: `route.ts` in each.

- [ ] **Step 5: Git log sanity**

Run: `git log --oneline main..HEAD | head -20`
Expected: 9 task commits + the plan commit.

No commit — verification gate only.

---

## Post-Chunk-4 Notes

- Shopping list is created on accept as a `todo_lists` row with `list_type='shopping'`. It appears in the existing Shopping page at `/shopping` like any manually-generated list.
- Packet rounding is best-effort: if an ingredient has no matching packet row, quantity passes through unrounded. Users can add household overrides via `/api/packet-sizes` as they discover gaps.
- Accept swallows shopping errors — if shopping generation fails for any reason, entries still land and `shopping_list_id` is null. The model's chat reply already confirms the plan; shopping-list failures surface later in the Shopping page (empty list). Chunk 5 could improve this by surfacing a retry toast.

## Flag for Chunk 5 (polish)

- **Conflict detection on accept.** Accept currently inserts naively; if another entry already occupies the same (date, meal_type) the insert fails opaquely. Pre-check + confirm-replace in the modal.
- **Draft editing from grid.** Clicking a `DraftMealCard` should open `AddMealDialog` in edit mode; save PATCHes `/api/meal-plans/generate/[id]/draft`.
- **Relative timestamps** in Recent plans dropdown.
- **Retry affordance** when accept succeeds but shopping list fails.
- **Packet-sizes settings UI** — the CRUD endpoints are in place; a page to browse and override is a chunk 5 add.
- **Typed `AcceptPreconditionError`** class so the accept route's 409 regex doesn't drift.

## Flag for later

- **Accept as single RPC.** The current accept does N writes across 3 tables with partial-failure recovery via swallowed errors. For production-critical atomicity, migrate the whole flow into a Postgres function called via `supabase.rpc(...)`.
