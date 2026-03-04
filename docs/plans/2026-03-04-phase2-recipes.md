# Phase 2: Recipes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the full recipe system — database tables, CRUD API, manual entry form with structured ingredients, AI image extraction via Claude vision, tagging, search/filter, and recipe scaling.

**Architecture:** New Supabase migration adds 4 tables (recipes, recipe_ingredients, recipe_tags, recipe_images) with RLS. New API routes under `/api/recipes/`. New `lib/ai/` module for Claude vision extraction (first Approach B extraction candidate). New `lib/utils/` modules for scaling and unit conversion. Recipe pages at `/recipes/`, `/recipes/new`, `/recipes/[id]`, `/recipes/[id]/edit`.

**Tech Stack:** Next.js 14+ (App Router), Supabase (Postgres + Storage + RLS), Anthropic Claude API (vision), Vitest, React Testing Library, shadcn/ui

**Design doc:** `docs/plans/2026-03-02-lemons-design.md` (Recipes section starts at line 308)

---

## Task 1: Database Migration — Recipe Tables

**Files:**
- Create: `supabase/migrations/00002_recipes.sql`

**Step 1: Write the migration**

Create `supabase/migrations/00002_recipes.sql`:

```sql
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
```

**Step 2: Apply the migration locally**

```bash
npx supabase migration up --local
```

Expected: Migration applies successfully, 4 new tables created.

**Step 3: Commit**

```bash
git add supabase/migrations/00002_recipes.sql
git commit -m "feat: add recipe tables migration with RLS and storage"
```

---

## Task 2: Generate TypeScript Types

**Files:**
- Modify: `src/types/database.ts`

**Step 1: Generate types from local Supabase**

```bash
npx supabase gen types typescript --local > src/types/database.ts
```

**Step 2: Verify types include recipe tables**

Open `src/types/database.ts` and confirm it contains `recipes`, `recipe_ingredients`, `recipe_tags`, and `recipe_images` table types.

**Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: regenerate Supabase types with recipe tables"
```

---

## Task 3: Unit Conversion Utility

**Files:**
- Create: `src/lib/utils/units.ts`
- Create: `src/lib/utils/units.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/utils/units.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeUnit, convertUnit, UNIT_ALIASES } from './units'

describe('normalizeUnit', () => {
  it('normalizes common aliases', () => {
    expect(normalizeUnit('tbsp')).toBe('tablespoon')
    expect(normalizeUnit('tsp')).toBe('teaspoon')
    expect(normalizeUnit('cups')).toBe('cup')
    expect(normalizeUnit('g')).toBe('gram')
    expect(normalizeUnit('kg')).toBe('kilogram')
    expect(normalizeUnit('ml')).toBe('millilitre')
    expect(normalizeUnit('l')).toBe('litre')
    expect(normalizeUnit('oz')).toBe('ounce')
    expect(normalizeUnit('lb')).toBe('pound')
    expect(normalizeUnit('lbs')).toBe('pound')
  })

  it('lowercases and trims', () => {
    expect(normalizeUnit('  TBSP  ')).toBe('tablespoon')
    expect(normalizeUnit('Cup')).toBe('cup')
  })

  it('returns original (lowered/trimmed) for unknown units', () => {
    expect(normalizeUnit('bunch')).toBe('bunch')
    expect(normalizeUnit('pinch')).toBe('pinch')
  })

  it('returns empty string for null/undefined/empty', () => {
    expect(normalizeUnit('')).toBe('')
    expect(normalizeUnit(null as unknown as string)).toBe('')
    expect(normalizeUnit(undefined as unknown as string)).toBe('')
  })
})

describe('convertUnit', () => {
  it('converts metric volume', () => {
    expect(convertUnit(1000, 'millilitre', 'litre')).toBeCloseTo(1)
    expect(convertUnit(1, 'litre', 'millilitre')).toBeCloseTo(1000)
  })

  it('converts metric weight', () => {
    expect(convertUnit(1000, 'gram', 'kilogram')).toBeCloseTo(1)
    expect(convertUnit(1, 'kilogram', 'gram')).toBeCloseTo(1000)
  })

  it('converts imperial volume', () => {
    expect(convertUnit(1, 'tablespoon', 'teaspoon')).toBeCloseTo(3)
    expect(convertUnit(1, 'cup', 'tablespoon')).toBeCloseTo(16)
  })

  it('converts between metric and imperial weight', () => {
    expect(convertUnit(1, 'pound', 'gram')).toBeCloseTo(453.592, 0)
    expect(convertUnit(1, 'ounce', 'gram')).toBeCloseTo(28.3495, 0)
  })

  it('returns null for incompatible units', () => {
    expect(convertUnit(1, 'gram', 'litre')).toBeNull()
    expect(convertUnit(1, 'cup', 'kilogram')).toBeNull()
  })

  it('returns null for unknown units', () => {
    expect(convertUnit(1, 'bunch', 'gram')).toBeNull()
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/lib/utils/units.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `src/lib/utils/units.ts`:

```ts
export const UNIT_ALIASES: Record<string, string> = {
  // Volume - metric
  ml: 'millilitre',
  milliliter: 'millilitre',
  milliliters: 'millilitre',
  millilitres: 'millilitre',
  l: 'litre',
  liter: 'litre',
  liters: 'litre',
  litres: 'litre',
  // Volume - imperial
  tsp: 'teaspoon',
  teaspoons: 'teaspoon',
  tbsp: 'tablespoon',
  tablespoons: 'tablespoon',
  cup: 'cup',
  cups: 'cup',
  'fl oz': 'fluid ounce',
  'fluid ounces': 'fluid ounce',
  pint: 'pint',
  pints: 'pint',
  // Weight - metric
  g: 'gram',
  grams: 'gram',
  kg: 'kilogram',
  kilograms: 'kilogram',
  // Weight - imperial
  oz: 'ounce',
  ounces: 'ounce',
  lb: 'pound',
  lbs: 'pound',
  pounds: 'pound',
}

export function normalizeUnit(unit: string): string {
  if (!unit) return ''
  const cleaned = unit.trim().toLowerCase()
  if (!cleaned) return ''
  return UNIT_ALIASES[cleaned] ?? cleaned
}

// Base units: millilitre (volume), gram (weight)
// All conversions go through base unit
type UnitGroup = 'volume' | 'weight'

const UNIT_TO_BASE: Record<string, { group: UnitGroup; factor: number }> = {
  // Volume → millilitre
  millilitre: { group: 'volume', factor: 1 },
  litre: { group: 'volume', factor: 1000 },
  teaspoon: { group: 'volume', factor: 4.92892 },
  tablespoon: { group: 'volume', factor: 14.7868 },
  'fluid ounce': { group: 'volume', factor: 29.5735 },
  cup: { group: 'volume', factor: 236.588 },
  pint: { group: 'volume', factor: 473.176 },
  // Weight → gram
  gram: { group: 'weight', factor: 1 },
  kilogram: { group: 'weight', factor: 1000 },
  ounce: { group: 'weight', factor: 28.3495 },
  pound: { group: 'weight', factor: 453.592 },
}

export function convertUnit(
  quantity: number,
  fromUnit: string,
  toUnit: string
): number | null {
  const from = UNIT_TO_BASE[fromUnit]
  const to = UNIT_TO_BASE[toUnit]
  if (!from || !to) return null
  if (from.group !== to.group) return null
  return (quantity * from.factor) / to.factor
}
```

**Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/lib/utils/units.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/lib/utils/units.ts src/lib/utils/units.test.ts
git commit -m "feat: add unit conversion utility with tests"
```

---

## Task 4: Recipe Scaling Utility

**Files:**
- Create: `src/lib/utils/scaling.ts`
- Create: `src/lib/utils/scaling.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/utils/scaling.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { scaleQuantity, scaleIngredients } from './scaling'

describe('scaleQuantity', () => {
  it('scales proportionally', () => {
    expect(scaleQuantity(2, 4, 8)).toBe(4) // double servings, double quantity
    expect(scaleQuantity(1, 4, 2)).toBe(0.5) // halve servings, halve quantity
    expect(scaleQuantity(3, 4, 4)).toBe(3) // same servings, same quantity
  })

  it('returns null for null quantity', () => {
    expect(scaleQuantity(null, 4, 8)).toBeNull()
  })

  it('rounds to 2 decimal places', () => {
    expect(scaleQuantity(1, 3, 7)).toBe(2.33)
  })

  it('handles zero base servings gracefully', () => {
    expect(scaleQuantity(1, 0, 4)).toBeNull()
  })
})

describe('scaleIngredients', () => {
  const ingredients = [
    { id: '1', recipe_id: 'r1', raw_text: '2 onions', quantity: 2, unit: null, name: 'onion', group: null, optional: false, notes: null, sort_order: 0 },
    { id: '2', recipe_id: 'r1', raw_text: '400ml coconut milk', quantity: 400, unit: 'millilitre', name: 'coconut milk', group: null, optional: false, notes: null, sort_order: 1 },
    { id: '3', recipe_id: 'r1', raw_text: 'salt to taste', quantity: null, unit: null, name: 'salt', group: null, optional: true, notes: 'to taste', sort_order: 2 },
  ]

  it('scales all ingredients with quantities', () => {
    const scaled = scaleIngredients(ingredients, 4, 8)
    expect(scaled[0].quantity).toBe(4)
    expect(scaled[1].quantity).toBe(800)
    expect(scaled[2].quantity).toBeNull()
  })

  it('preserves non-quantity fields', () => {
    const scaled = scaleIngredients(ingredients, 4, 8)
    expect(scaled[0].name).toBe('onion')
    expect(scaled[0].raw_text).toBe('2 onions')
    expect(scaled[2].notes).toBe('to taste')
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/lib/utils/scaling.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `src/lib/utils/scaling.ts`:

```ts
export function scaleQuantity(
  quantity: number | null,
  baseServings: number,
  desiredServings: number
): number | null {
  if (quantity === null || quantity === undefined) return null
  if (!baseServings || baseServings === 0) return null
  const scaled = (quantity * desiredServings) / baseServings
  return Math.round(scaled * 100) / 100
}

export interface Ingredient {
  id: string
  recipe_id: string
  raw_text: string
  quantity: number | null
  unit: string | null
  name: string | null
  group: string | null
  optional: boolean
  notes: string | null
  sort_order: number
}

export function scaleIngredients(
  ingredients: Ingredient[],
  baseServings: number,
  desiredServings: number
): Ingredient[] {
  return ingredients.map((ing) => ({
    ...ing,
    quantity: scaleQuantity(ing.quantity, baseServings, desiredServings),
  }))
}
```

**Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/lib/utils/scaling.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/lib/utils/scaling.ts src/lib/utils/scaling.test.ts
git commit -m "feat: add recipe scaling utility with tests"
```

---

## Task 5: Ingredient Name Normalization Utility

**Files:**
- Create: `src/lib/utils/ingredients.ts`
- Create: `src/lib/utils/ingredients.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/utils/ingredients.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeName, parseIngredientText } from './ingredients'

describe('normalizeName', () => {
  it('lowercases', () => {
    expect(normalizeName('Onion')).toBe('onion')
  })

  it('trims whitespace', () => {
    expect(normalizeName('  garlic  ')).toBe('garlic')
  })

  it('strips common adjectives', () => {
    expect(normalizeName('large red onion')).toBe('red onion')
    expect(normalizeName('small fresh tomatoes')).toBe('tomato')
    expect(normalizeName('medium ripe avocado')).toBe('avocado')
  })

  it('singularizes common plurals', () => {
    expect(normalizeName('onions')).toBe('onion')
    expect(normalizeName('tomatoes')).toBe('tomato')
    expect(normalizeName('potatoes')).toBe('potato')
    expect(normalizeName('berries')).toBe('berry')
    expect(normalizeName('leaves')).toBe('leaf')
  })

  it('handles already-singular names', () => {
    expect(normalizeName('rice')).toBe('rice')
    expect(normalizeName('garlic')).toBe('garlic')
  })
})

describe('parseIngredientText', () => {
  it('parses "2 onions"', () => {
    const result = parseIngredientText('2 onions')
    expect(result.quantity).toBe(2)
    expect(result.unit).toBeNull()
    expect(result.name).toBe('onion')
  })

  it('parses "400ml coconut milk"', () => {
    const result = parseIngredientText('400ml coconut milk')
    expect(result.quantity).toBe(400)
    expect(result.unit).toBe('millilitre')
    expect(result.name).toBe('coconut milk')
  })

  it('parses "1 tbsp olive oil"', () => {
    const result = parseIngredientText('1 tbsp olive oil')
    expect(result.quantity).toBe(1)
    expect(result.unit).toBe('tablespoon')
    expect(result.name).toBe('olive oil')
  })

  it('parses "salt to taste" (no quantity)', () => {
    const result = parseIngredientText('salt to taste')
    expect(result.quantity).toBeNull()
    expect(result.unit).toBeNull()
    expect(result.name).toBe('salt')
    expect(result.notes).toBe('to taste')
  })

  it('parses "2 large onions, diced"', () => {
    const result = parseIngredientText('2 large onions, diced')
    expect(result.quantity).toBe(2)
    expect(result.name).toBe('onion')
    expect(result.notes).toBe('diced')
  })

  it('parses fractions like "1/2 cup flour"', () => {
    const result = parseIngredientText('1/2 cup flour')
    expect(result.quantity).toBe(0.5)
    expect(result.unit).toBe('cup')
    expect(result.name).toBe('flour')
  })

  it('parses "1 1/2 tsp salt"', () => {
    const result = parseIngredientText('1 1/2 tsp salt')
    expect(result.quantity).toBe(1.5)
    expect(result.unit).toBe('teaspoon')
    expect(result.name).toBe('salt')
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
npm run test:run -- src/lib/utils/ingredients.test.ts
```

Expected: FAIL — module not found.

**Step 3: Write minimal implementation**

Create `src/lib/utils/ingredients.ts`:

```ts
import { normalizeUnit, UNIT_ALIASES } from './units'

const SIZE_ADJECTIVES = ['large', 'small', 'medium', 'big', 'thin', 'thick', 'fresh', 'ripe', 'whole']

const KNOWN_UNITS = new Set([
  ...Object.keys(UNIT_ALIASES),
  ...Object.values(UNIT_ALIASES),
])

// Simple pluralization rules for food items
export function normalizeName(name: string): string {
  if (!name) return ''
  let result = name.trim().toLowerCase()

  // Strip size adjectives
  for (const adj of SIZE_ADJECTIVES) {
    result = result.replace(new RegExp(`\\b${adj}\\b`, 'g'), '')
  }
  result = result.replace(/\s+/g, ' ').trim()

  // Singularize
  result = singularize(result)

  return result
}

function singularize(word: string): string {
  // leaves → leaf
  if (word.endsWith('leaves')) return word.slice(0, -6) + 'leaf'
  // berries → berry
  if (word.endsWith('ries')) return word.slice(0, -3) + 'y'
  // tomatoes, potatoes → tomato, potato
  if (word.endsWith('toes')) return word.slice(0, -2)
  // matches, batches → match, batch (but not "es" words that are singular like "rice")
  if (word.endsWith('ches') || word.endsWith('shes') || word.endsWith('sses') || word.endsWith('xes') || word.endsWith('zes')) {
    return word.slice(0, -2)
  }
  // onions, carrots → onion, carrot
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) {
    return word.slice(0, -1)
  }
  return word
}

// Parse fractions like "1/2" or "1 1/2"
function parseFraction(str: string): number | null {
  const mixed = str.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) {
    return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3])
  }
  const frac = str.match(/^(\d+)\/(\d+)$/)
  if (frac) {
    return parseInt(frac[1]) / parseInt(frac[2])
  }
  const num = parseFloat(str)
  return isNaN(num) ? null : num
}

export interface ParsedIngredient {
  quantity: number | null
  unit: string | null
  name: string
  notes: string | null
  raw_text: string
}

export function parseIngredientText(text: string): ParsedIngredient {
  const raw_text = text.trim()
  let remaining = raw_text

  // Extract notes after comma
  let notes: string | null = null
  const commaIdx = remaining.indexOf(',')
  if (commaIdx !== -1) {
    notes = remaining.slice(commaIdx + 1).trim()
    remaining = remaining.slice(0, commaIdx).trim()
  }

  // Extract "to taste", "as needed" etc. as notes
  const notePatterns = /\b(to taste|as needed|for garnish|for serving)\b/i
  const noteMatch = remaining.match(notePatterns)
  if (noteMatch) {
    notes = notes ? `${noteMatch[1]}, ${notes}` : noteMatch[1]
    remaining = remaining.replace(notePatterns, '').trim()
  }

  // Try to extract quantity (number or fraction at start)
  let quantity: number | null = null
  const qtyMatch = remaining.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+\.?\d*)/)
  if (qtyMatch) {
    quantity = parseFraction(qtyMatch[1])
    remaining = remaining.slice(qtyMatch[0].length).trim()
  }

  // Check if next word (possibly joined with number like "400ml") is a unit
  // Handle joined format like "400ml"
  if (quantity === null) {
    const joinedMatch = raw_text.match(/^(\d+\.?\d*)\s*(ml|g|kg|l|oz|lb|lbs|tsp|tbsp)\b/i)
    if (joinedMatch) {
      quantity = parseFloat(joinedMatch[1])
      remaining = raw_text.slice(joinedMatch[0].length).trim()
      const unit = normalizeUnit(joinedMatch[2])
      const name = normalizeName(remaining)
      return { quantity, unit: unit || null, name, notes, raw_text }
    }
  }

  // Try to extract unit
  let unit: string | null = null
  const words = remaining.split(/\s+/)
  if (words.length > 0 && KNOWN_UNITS.has(words[0].toLowerCase())) {
    unit = normalizeUnit(words[0])
    remaining = words.slice(1).join(' ')
  }

  const name = normalizeName(remaining)

  return { quantity, unit: unit || null, name, notes, raw_text }
}
```

**Step 4: Run tests to verify they pass**

```bash
npm run test:run -- src/lib/utils/ingredients.test.ts
```

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/lib/utils/ingredients.ts src/lib/utils/ingredients.test.ts
git commit -m "feat: add ingredient parsing and name normalization with tests"
```

---

## Task 6: Recipe CRUD API Routes

**Files:**
- Create: `src/app/api/recipes/route.ts` (GET list, POST create)
- Create: `src/app/api/recipes/[id]/route.ts` (GET one, PUT update, DELETE)

**Step 1: Create the list/create route**

Create `src/app/api/recipes/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/recipes — list recipes for active household
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const householdId = searchParams.get('householdId')
  if (!householdId) {
    return NextResponse.json({ error: 'householdId is required' }, { status: 400 })
  }

  const search = searchParams.get('search') || ''
  const tag = searchParams.get('tag') || ''

  let query = supabase
    .from('recipes')
    .select(`
      *,
      recipe_tags(tag_name),
      recipe_images(id, url, type, sort_order)
    `)
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })

  if (search) {
    query = query.ilike('title', `%${search}%`)
  }

  if (tag) {
    // Filter recipes that have a matching tag
    query = query.contains('recipe_tags', [{ tag_name: tag }])
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // If tag filter was used via contains and didn't work, fall back to manual filter
  // Supabase .contains on joined tables is unreliable — filter in JS
  let recipes = data || []
  if (tag) {
    recipes = recipes.filter((r: any) =>
      r.recipe_tags?.some((t: any) => t.tag_name === tag)
    )
  }

  return NextResponse.json(recipes)
}

// POST /api/recipes — create a new recipe
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, description, servings, prep_time, cook_time, instructions, source_url, household_id, ingredients, tags } = body

  if (!title || !household_id) {
    return NextResponse.json({ error: 'title and household_id are required' }, { status: 400 })
  }

  // Insert recipe
  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .insert({
      title,
      description: description || null,
      servings: servings || 4,
      prep_time: prep_time || null,
      cook_time: cook_time || null,
      instructions: instructions || [],
      source_url: source_url || null,
      household_id,
      created_by: user.id,
    })
    .select()
    .single()

  if (recipeError) {
    return NextResponse.json({ error: recipeError.message }, { status: 500 })
  }

  // Insert ingredients if provided
  if (ingredients && ingredients.length > 0) {
    const ingredientRows = ingredients.map((ing: any, idx: number) => ({
      recipe_id: recipe.id,
      raw_text: ing.raw_text,
      quantity: ing.quantity ?? null,
      unit: ing.unit ?? null,
      name: ing.name ?? null,
      group: ing.group ?? null,
      optional: ing.optional ?? false,
      notes: ing.notes ?? null,
      sort_order: ing.sort_order ?? idx,
    }))

    const { error: ingError } = await supabase
      .from('recipe_ingredients')
      .insert(ingredientRows)

    if (ingError) {
      // Recipe was created but ingredients failed — log but don't fail the whole request
      console.error('Failed to insert ingredients:', ingError.message)
    }
  }

  // Insert tags if provided
  if (tags && tags.length > 0) {
    const tagRows = tags.map((tagName: string) => ({
      recipe_id: recipe.id,
      tag_name: tagName.trim().toLowerCase(),
    }))

    const { error: tagError } = await supabase
      .from('recipe_tags')
      .insert(tagRows)

    if (tagError) {
      console.error('Failed to insert tags:', tagError.message)
    }
  }

  // Return full recipe with relations
  const { data: fullRecipe } = await supabase
    .from('recipes')
    .select(`
      *,
      recipe_ingredients(*),
      recipe_tags(tag_name),
      recipe_images(id, url, type, sort_order)
    `)
    .eq('id', recipe.id)
    .single()

  return NextResponse.json(fullRecipe, { status: 201 })
}
```

**Step 2: Create the single recipe route**

Create `src/app/api/recipes/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/recipes/[id] — get single recipe with all relations
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('recipes')
    .select(`
      *,
      recipe_ingredients(*),
      recipe_tags(tag_name),
      recipe_images(id, url, type, sort_order)
    `)
    .eq('id', id)
    .order('sort_order', { referencedTable: 'recipe_ingredients', ascending: true })
    .order('sort_order', { referencedTable: 'recipe_images', ascending: true })
    .single()

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  return NextResponse.json(data)
}

// PUT /api/recipes/[id] — update recipe
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, description, servings, prep_time, cook_time, instructions, source_url, ingredients, tags } = body

  // Update recipe fields
  const { error: recipeError } = await supabase
    .from('recipes')
    .update({
      title,
      description: description ?? null,
      servings: servings ?? 4,
      prep_time: prep_time ?? null,
      cook_time: cook_time ?? null,
      instructions: instructions ?? [],
      source_url: source_url ?? null,
    })
    .eq('id', id)

  if (recipeError) {
    return NextResponse.json({ error: recipeError.message }, { status: 500 })
  }

  // Replace ingredients: delete all, re-insert
  if (ingredients !== undefined) {
    await supabase.from('recipe_ingredients').delete().eq('recipe_id', id)

    if (ingredients.length > 0) {
      const ingredientRows = ingredients.map((ing: any, idx: number) => ({
        recipe_id: id,
        raw_text: ing.raw_text,
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? null,
        name: ing.name ?? null,
        group: ing.group ?? null,
        optional: ing.optional ?? false,
        notes: ing.notes ?? null,
        sort_order: ing.sort_order ?? idx,
      }))

      const { error: ingError } = await supabase
        .from('recipe_ingredients')
        .insert(ingredientRows)

      if (ingError) {
        console.error('Failed to replace ingredients:', ingError.message)
      }
    }
  }

  // Replace tags: delete all, re-insert
  if (tags !== undefined) {
    await supabase.from('recipe_tags').delete().eq('recipe_id', id)

    if (tags.length > 0) {
      const tagRows = tags.map((tagName: string) => ({
        recipe_id: id,
        tag_name: tagName.trim().toLowerCase(),
      }))

      const { error: tagError } = await supabase
        .from('recipe_tags')
        .insert(tagRows)

      if (tagError) {
        console.error('Failed to replace tags:', tagError.message)
      }
    }
  }

  // Return updated recipe with relations
  const { data: fullRecipe } = await supabase
    .from('recipes')
    .select(`
      *,
      recipe_ingredients(*),
      recipe_tags(tag_name),
      recipe_images(id, url, type, sort_order)
    `)
    .eq('id', id)
    .order('sort_order', { referencedTable: 'recipe_ingredients', ascending: true })
    .single()

  return NextResponse.json(fullRecipe)
}

// DELETE /api/recipes/[id] — delete recipe
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('recipes')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

**Step 3: Commit**

```bash
git add src/app/api/recipes/route.ts src/app/api/recipes/\[id\]/route.ts
git commit -m "feat: add recipe CRUD API routes"
```

---

## Task 7: AI Recipe Extraction — Claude Vision Module

**Files:**
- Create: `src/lib/ai/extract-recipe.ts`
- Create: `src/lib/ai/extract-recipe.test.ts`
- Create: `src/app/api/recipes/extract/route.ts`

**Step 1: Install Anthropic SDK**

```bash
npm install @anthropic-ai/sdk
```

**Step 2: Write failing test for extraction response parsing**

We can't test the actual Claude API call in unit tests, but we can test the response parsing/validation logic.

Create `src/lib/ai/extract-recipe.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateExtractionResult, type ExtractionResult } from './extract-recipe'

describe('validateExtractionResult', () => {
  it('validates a correct extraction result', () => {
    const input: ExtractionResult = {
      title: 'Chicken Curry',
      description: 'A simple chicken curry',
      servings: 4,
      prep_time: 15,
      cook_time: 30,
      ingredients: [
        { raw_text: '500g chicken breast', quantity: 500, unit: 'g', name: 'chicken breast', notes: null },
        { raw_text: '1 onion, diced', quantity: 1, unit: null, name: 'onion', notes: 'diced' },
      ],
      instructions: ['Dice the chicken', 'Fry the onion', 'Add spices', 'Simmer'],
      tags: ['curry', 'chicken', 'dinner'],
    }
    const result = validateExtractionResult(input)
    expect(result.title).toBe('Chicken Curry')
    expect(result.ingredients).toHaveLength(2)
    expect(result.instructions).toHaveLength(4)
  })

  it('provides defaults for missing optional fields', () => {
    const input = {
      title: 'Test Recipe',
      ingredients: [{ raw_text: 'some ingredient' }],
      instructions: ['Step 1'],
    }
    const result = validateExtractionResult(input as any)
    expect(result.servings).toBe(4)
    expect(result.description).toBeNull()
    expect(result.prep_time).toBeNull()
    expect(result.cook_time).toBeNull()
    expect(result.tags).toEqual([])
  })

  it('throws for missing title', () => {
    const input = { ingredients: [], instructions: [] }
    expect(() => validateExtractionResult(input as any)).toThrow()
  })

  it('throws for empty ingredients', () => {
    const input = { title: 'Test', ingredients: [], instructions: ['Step 1'] }
    expect(() => validateExtractionResult(input as any)).toThrow()
  })

  it('throws for empty instructions', () => {
    const input = { title: 'Test', ingredients: [{ raw_text: 'foo' }], instructions: [] }
    expect(() => validateExtractionResult(input as any)).toThrow()
  })
})
```

**Step 3: Run tests to verify they fail**

```bash
npm run test:run -- src/lib/ai/extract-recipe.test.ts
```

Expected: FAIL — module not found.

**Step 4: Write the extraction module**

Create `src/lib/ai/extract-recipe.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk'

export interface ExtractedIngredient {
  raw_text: string
  quantity: number | null
  unit: string | null
  name: string | null
  notes: string | null
}

export interface ExtractionResult {
  title: string
  description: string | null
  servings: number
  prep_time: number | null
  cook_time: number | null
  ingredients: ExtractedIngredient[]
  instructions: string[]
  tags: string[]
}

export function validateExtractionResult(input: any): ExtractionResult {
  if (!input.title || typeof input.title !== 'string') {
    throw new Error('Extraction result must include a title')
  }
  if (!input.ingredients || !Array.isArray(input.ingredients) || input.ingredients.length === 0) {
    throw new Error('Extraction result must include at least one ingredient')
  }
  if (!input.instructions || !Array.isArray(input.instructions) || input.instructions.length === 0) {
    throw new Error('Extraction result must include at least one instruction step')
  }

  return {
    title: input.title,
    description: input.description ?? null,
    servings: typeof input.servings === 'number' ? input.servings : 4,
    prep_time: typeof input.prep_time === 'number' ? input.prep_time : null,
    cook_time: typeof input.cook_time === 'number' ? input.cook_time : null,
    ingredients: input.ingredients.map((ing: any) => ({
      raw_text: ing.raw_text || '',
      quantity: typeof ing.quantity === 'number' ? ing.quantity : null,
      unit: ing.unit || null,
      name: ing.name || null,
      notes: ing.notes || null,
    })),
    instructions: input.instructions.filter((s: any) => typeof s === 'string' && s.trim()),
    tags: Array.isArray(input.tags) ? input.tags.map((t: string) => t.toLowerCase().trim()) : [],
  }
}

const EXTRACTION_PROMPT = `You are a recipe extraction assistant. Analyze this image of a recipe (photo of a cookbook page, screenshot of a website, or handwritten recipe) and extract structured data.

Return ONLY valid JSON with this exact structure:
{
  "title": "Recipe title",
  "description": "Brief description of the dish",
  "servings": 4,
  "prep_time": 15,
  "cook_time": 30,
  "ingredients": [
    {
      "raw_text": "2 large onions, diced",
      "quantity": 2,
      "unit": null,
      "name": "onion",
      "notes": "diced"
    }
  ],
  "instructions": [
    "Step 1 text",
    "Step 2 text"
  ],
  "tags": ["cuisine-type", "dietary-info", "meal-type"]
}

Rules:
- quantity: numeric value (use decimals for fractions: 1/2 = 0.5). null if unspecified.
- unit: use standard abbreviations (g, kg, ml, l, tsp, tbsp, cup, oz, lb). null if no unit (e.g. "2 onions").
- name: singular, lowercase, size adjectives stripped ("onion" not "large onions").
- notes: preparation instructions separated from the ingredient name ("diced", "finely chopped").
- instructions: each step as a separate string, in order.
- tags: lowercase, relevant categories (e.g. "italian", "vegetarian", "dinner", "quick").
- If something is unclear or illegible, make your best guess and note uncertainty in the relevant notes field.
- prep_time and cook_time in minutes. null if not stated.`

export async function extractRecipeFromImage(
  imageBase64: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
): Promise<ExtractionResult> {
  const client = new Anthropic()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: imageBase64,
            },
          },
          {
            type: 'text',
            text: EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  })

  // Extract JSON from response
  const textBlock = response.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  // Try to parse JSON from the response (may be wrapped in ```json blocks)
  let jsonStr = textBlock.text
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1]
  }

  const parsed = JSON.parse(jsonStr.trim())
  return validateExtractionResult(parsed)
}
```

**Step 5: Run tests to verify they pass**

```bash
npm run test:run -- src/lib/ai/extract-recipe.test.ts
```

Expected: All tests PASS.

**Step 6: Create the extraction API route**

Create `src/app/api/recipes/extract/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractRecipeFromImage } from '@/lib/ai/extract-recipe'

const VALID_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const

// POST /api/recipes/extract — extract recipe from uploaded image
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('image') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 })
  }

  const mediaType = file.type as (typeof VALID_TYPES)[number]
  if (!VALID_TYPES.includes(mediaType)) {
    return NextResponse.json(
      { error: `Invalid image type. Supported: ${VALID_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  // Convert to base64
  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  try {
    const result = await extractRecipeFromImage(base64, mediaType)
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Recipe extraction failed:', error)
    return NextResponse.json(
      { error: 'Failed to extract recipe from image. Please try again or enter manually.' },
      { status: 422 }
    )
  }
}
```

**Step 7: Commit**

```bash
npm install @anthropic-ai/sdk
git add src/lib/ai/extract-recipe.ts src/lib/ai/extract-recipe.test.ts src/app/api/recipes/extract/route.ts package.json package-lock.json
git commit -m "feat: add AI recipe extraction via Claude vision API"
```

---

## Task 8: Install Additional shadcn/ui Components

Before building recipe UI, install the components we'll need.

**Step 1: Install shadcn/ui components**

```bash
npx shadcn@latest add badge textarea dialog tabs scroll-area form
```

**Step 2: Commit**

```bash
git add src/components/ui/
git commit -m "feat: add shadcn/ui components for recipe UI"
```

---

## Task 9: Recipe List Page

**Files:**
- Modify: `src/app/(dashboard)/recipes/page.tsx`
- Create: `src/components/features/recipe-card.tsx`
- Create: `src/components/features/recipe-search.tsx`

**Step 1: Build the recipe card component**

Create `src/components/features/recipe-card.tsx`:

```tsx
import Link from 'next/link'
import { Clock, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface RecipeCardProps {
  recipe: {
    id: string
    title: string
    description: string | null
    servings: number
    prep_time: number | null
    cook_time: number | null
    recipe_tags: { tag_name: string }[]
    recipe_images: { url: string; type: string }[]
  }
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0)

  return (
    <Link href={`/recipes/${recipe.id}`}>
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="line-clamp-2 text-lg">{recipe.title}</CardTitle>
          {recipe.description && (
            <p className="text-muted-foreground line-clamp-2 text-sm">
              {recipe.description}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-muted-foreground text-sm">
            {totalTime > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {totalTime} min
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              {recipe.servings}
            </span>
          </div>
          {recipe.recipe_tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {recipe.recipe_tags.slice(0, 4).map((t) => (
                <Badge key={t.tag_name} variant="secondary" className="text-xs">
                  {t.tag_name}
                </Badge>
              ))}
              {recipe.recipe_tags.length > 4 && (
                <Badge variant="outline" className="text-xs">
                  +{recipe.recipe_tags.length - 4}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
```

**Step 2: Build the recipe search component**

Create `src/components/features/recipe-search.tsx`:

```tsx
'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface RecipeSearchProps {
  allTags: string[]
  activeTag: string | null
}

export function RecipeSearch({ allTags, activeTag }: RecipeSearchProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchValue, setSearchValue] = useState(searchParams.get('search') || '')

  const updateParams = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`/recipes?${params.toString()}`)
    },
    [router, searchParams]
  )

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateParams('search', searchValue || null)
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSearch} className="relative">
        <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search recipes..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="pl-9"
        />
        {searchValue && (
          <button
            type="button"
            onClick={() => {
              setSearchValue('')
              updateParams('search', null)
            }}
            className="text-muted-foreground absolute top-1/2 right-3 -translate-y-1/2"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </form>
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {allTags.map((tag) => (
            <Badge
              key={tag}
              variant={tag === activeTag ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => updateParams('tag', tag === activeTag ? null : tag)}
            >
              {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 3: Build the recipes page**

Replace `src/app/(dashboard)/recipes/page.tsx`:

```tsx
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { RecipeCard } from '@/components/features/recipe-card'
import { RecipeSearch } from '@/components/features/recipe-search'

export default async function RecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; tag?: string }>
}) {
  const { search, tag } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return null

  // Get user's default household
  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .single()

  const householdId = profile?.default_household_id
  if (!householdId) return null

  // Fetch recipes
  let query = supabase
    .from('recipes')
    .select(`
      *,
      recipe_tags(tag_name),
      recipe_images(id, url, type, sort_order)
    `)
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })

  if (search) {
    query = query.ilike('title', `%${search}%`)
  }

  const { data: recipes } = await query

  let filteredRecipes = recipes || []
  if (tag) {
    filteredRecipes = filteredRecipes.filter((r: any) =>
      r.recipe_tags?.some((t: any) => t.tag_name === tag)
    )
  }

  // Collect all unique tags for the filter
  const allTags = Array.from(
    new Set(
      (recipes || []).flatMap((r: any) =>
        r.recipe_tags?.map((t: any) => t.tag_name) || []
      )
    )
  ).sort()

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Recipes</h1>
        <Link href="/recipes/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Recipe
          </Button>
        </Link>
      </div>

      <RecipeSearch allTags={allTags} activeTag={tag || null} />

      {filteredRecipes.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-muted-foreground text-lg">
            {search || tag ? 'No recipes match your search.' : 'No recipes yet.'}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {!search && !tag && 'Add your first recipe to get started.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRecipes.map((recipe: any) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 4: Commit**

```bash
git add src/app/\(dashboard\)/recipes/page.tsx src/components/features/recipe-card.tsx src/components/features/recipe-search.tsx
git commit -m "feat: add recipe list page with search and tag filtering"
```

---

## Task 10: Recipe Detail Page

**Files:**
- Create: `src/app/(dashboard)/recipes/[id]/page.tsx`
- Create: `src/components/features/recipe-detail.tsx`

**Step 1: Build the recipe detail client component**

Create `src/components/features/recipe-detail.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Clock, Edit, Minus, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { scaleIngredients } from '@/lib/utils/scaling'

interface RecipeDetailProps {
  recipe: {
    id: string
    title: string
    description: string | null
    servings: number
    prep_time: number | null
    cook_time: number | null
    instructions: string[]
    source_url: string | null
    recipe_ingredients: {
      id: string
      recipe_id: string
      raw_text: string
      quantity: number | null
      unit: string | null
      name: string | null
      group: string | null
      optional: boolean
      notes: string | null
      sort_order: number
    }[]
    recipe_tags: { tag_name: string }[]
    recipe_images: { id: string; url: string; type: string }[]
  }
}

export function RecipeDetail({ recipe }: RecipeDetailProps) {
  const router = useRouter()
  const [desiredServings, setDesiredServings] = useState(recipe.servings)
  const [deleting, setDeleting] = useState(false)

  const scaledIngredients = scaleIngredients(
    recipe.recipe_ingredients,
    recipe.servings,
    desiredServings
  )

  const handleDelete = async () => {
    if (!confirm('Delete this recipe? This cannot be undone.')) return
    setDeleting(true)
    const res = await fetch(`/api/recipes/${recipe.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/recipes')
      router.refresh()
    } else {
      setDeleting(false)
      alert('Failed to delete recipe')
    }
  }

  // Group ingredients
  const groups = new Map<string, typeof scaledIngredients>()
  for (const ing of scaledIngredients) {
    const group = ing.group || ''
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push(ing)
  }

  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0)

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Link href="/recipes">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </Link>
        <div className="flex-1" />
        <Link href={`/recipes/${recipe.id}/edit`}>
          <Button variant="outline" size="sm">
            <Edit className="mr-1 h-4 w-4" />
            Edit
          </Button>
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
          className="text-destructive"
        >
          <Trash2 className="mr-1 h-4 w-4" />
          Delete
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold">{recipe.title}</h1>
        {recipe.description && (
          <p className="text-muted-foreground mt-2">{recipe.description}</p>
        )}
        <div className="mt-3 flex items-center gap-4 text-sm">
          {recipe.prep_time && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Prep: {recipe.prep_time} min
            </span>
          )}
          {recipe.cook_time && (
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Cook: {recipe.cook_time} min
            </span>
          )}
          {totalTime > 0 && (
            <span className="text-muted-foreground font-medium">
              Total: {totalTime} min
            </span>
          )}
        </div>
        {recipe.recipe_tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {recipe.recipe_tags.map((t) => (
              <Badge key={t.tag_name} variant="secondary">
                {t.tag_name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Ingredients */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Ingredients</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setDesiredServings((s) => Math.max(1, s - 1))}
              >
                <Minus className="h-3 w-3" />
              </Button>
              <span className="flex min-w-[4rem] items-center justify-center gap-1 text-sm">
                <Users className="h-4 w-4" />
                {desiredServings}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setDesiredServings((s) => s + 1)}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {Array.from(groups.entries()).map(([group, ings]) => (
            <div key={group} className="mb-4 last:mb-0">
              {group && (
                <h4 className="mb-2 text-sm font-medium">{group}</h4>
              )}
              <ul className="space-y-1.5">
                {ings.map((ing) => (
                  <li key={ing.id} className={`text-sm ${ing.optional ? 'text-muted-foreground' : ''}`}>
                    {ing.quantity != null && (
                      <span className="font-medium">
                        {formatQuantity(ing.quantity)}
                      </span>
                    )}{' '}
                    {ing.unit && <span>{ing.unit}</span>}{' '}
                    <span>{ing.name || ing.raw_text}</span>
                    {ing.notes && (
                      <span className="text-muted-foreground">, {ing.notes}</span>
                    )}
                    {ing.optional && (
                      <span className="text-muted-foreground"> (optional)</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-3 pl-5">
            {recipe.instructions.map((step, i) => (
              <li key={i} className="text-sm leading-relaxed">
                {step}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {recipe.source_url && (
        <p className="text-muted-foreground text-sm">
          Source:{' '}
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            {recipe.source_url}
          </a>
        </p>
      )}
    </div>
  )
}

function formatQuantity(n: number): string {
  if (n === Math.floor(n)) return n.toString()
  // Common fractions
  const fractions: Record<string, string> = {
    '0.25': '1/4',
    '0.33': '1/3',
    '0.5': '1/2',
    '0.67': '2/3',
    '0.75': '3/4',
  }
  const decimal = (n % 1).toFixed(2)
  const whole = Math.floor(n)
  const frac = fractions[decimal]
  if (frac) {
    return whole > 0 ? `${whole} ${frac}` : frac
  }
  return n.toFixed(1)
}
```

**Step 2: Build the recipe detail page (Server Component)**

Create `src/app/(dashboard)/recipes/[id]/page.tsx`:

```tsx
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RecipeDetail } from '@/components/features/recipe-detail'

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: recipe, error } = await supabase
    .from('recipes')
    .select(`
      *,
      recipe_ingredients(*),
      recipe_tags(tag_name),
      recipe_images(id, url, type, sort_order)
    `)
    .eq('id', id)
    .order('sort_order', { referencedTable: 'recipe_ingredients', ascending: true })
    .order('sort_order', { referencedTable: 'recipe_images', ascending: true })
    .single()

  if (error || !recipe) notFound()

  return <RecipeDetail recipe={recipe as any} />
}
```

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/recipes/\[id\]/page.tsx src/components/features/recipe-detail.tsx
git commit -m "feat: add recipe detail page with ingredient scaling"
```

---

## Task 11: Recipe Form — Create and Edit

**Files:**
- Create: `src/components/features/recipe-form.tsx`
- Create: `src/components/features/ingredient-input.tsx`
- Create: `src/components/features/tag-input.tsx`
- Create: `src/app/(dashboard)/recipes/new/page.tsx`
- Create: `src/app/(dashboard)/recipes/[id]/edit/page.tsx`

**Step 1: Build the ingredient input component**

Create `src/components/features/ingredient-input.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { parseIngredientText } from '@/lib/utils/ingredients'
import { normalizeUnit } from '@/lib/utils/units'

export interface IngredientRow {
  raw_text: string
  quantity: number | null
  unit: string | null
  name: string | null
  group: string | null
  optional: boolean
  notes: string | null
}

interface IngredientInputProps {
  ingredients: IngredientRow[]
  onChange: (ingredients: IngredientRow[]) => void
}

export function IngredientInput({ ingredients, onChange }: IngredientInputProps) {
  const [quickAdd, setQuickAdd] = useState('')

  const handleQuickAdd = () => {
    if (!quickAdd.trim()) return
    const parsed = parseIngredientText(quickAdd)
    const newIngredient: IngredientRow = {
      raw_text: quickAdd.trim(),
      quantity: parsed.quantity,
      unit: parsed.unit ? normalizeUnit(parsed.unit) : null,
      name: parsed.name,
      group: null,
      optional: false,
      notes: parsed.notes,
    }
    onChange([...ingredients, newIngredient])
    setQuickAdd('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleQuickAdd()
    }
  }

  const removeIngredient = (idx: number) => {
    onChange(ingredients.filter((_, i) => i !== idx))
  }

  const updateIngredient = (idx: number, field: keyof IngredientRow, value: any) => {
    const updated = [...ingredients]
    updated[idx] = { ...updated[idx], [field]: value }
    onChange(updated)
  }

  return (
    <div className="space-y-3">
      {ingredients.map((ing, idx) => (
        <div key={idx} className="flex items-start gap-2">
          <GripVertical className="text-muted-foreground mt-2.5 h-4 w-4 shrink-0" />
          <div className="grid flex-1 grid-cols-12 gap-2">
            <Input
              className="col-span-2"
              placeholder="Qty"
              value={ing.quantity ?? ''}
              onChange={(e) =>
                updateIngredient(idx, 'quantity', e.target.value ? parseFloat(e.target.value) : null)
              }
              type="number"
              step="any"
            />
            <Input
              className="col-span-2"
              placeholder="Unit"
              value={ing.unit ?? ''}
              onChange={(e) => updateIngredient(idx, 'unit', e.target.value || null)}
            />
            <Input
              className="col-span-4"
              placeholder="Ingredient"
              value={ing.name ?? ''}
              onChange={(e) => updateIngredient(idx, 'name', e.target.value || null)}
            />
            <Input
              className="col-span-3"
              placeholder="Notes"
              value={ing.notes ?? ''}
              onChange={(e) => updateIngredient(idx, 'notes', e.target.value || null)}
            />
            <Button
              variant="ghost"
              size="icon"
              className="col-span-1 h-9 w-9"
              onClick={() => removeIngredient(idx)}
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      <div className="flex gap-2">
        <Input
          placeholder='Quick add: "2 large onions, diced"'
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button type="button" variant="outline" onClick={handleQuickAdd} disabled={!quickAdd.trim()}>
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  )
}
```

**Step 2: Build the tag input component**

Create `src/components/features/tag-input.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const SUGGESTED_TAGS = [
  // Cuisine
  'british', 'italian', 'mexican', 'indian', 'chinese', 'thai', 'japanese', 'mediterranean',
  // Dietary
  'vegetarian', 'vegan', 'gluten-free', 'dairy-free',
  // Meal type
  'breakfast', 'lunch', 'dinner', 'snack', 'dessert',
  // Other
  'quick', 'batch-cook', 'kid-friendly', 'healthy', 'comfort-food',
]

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
}

export function TagInput({ tags, onChange }: TagInputProps) {
  const [input, setInput] = useState('')

  const addTag = (tag: string) => {
    const normalized = tag.trim().toLowerCase()
    if (!normalized || tags.includes(normalized)) return
    onChange([...tags, normalized])
    setInput('')
  }

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  const suggestions = SUGGESTED_TAGS.filter(
    (t) => !tags.includes(t) && t.includes(input.toLowerCase())
  ).slice(0, 8)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <button type="button" onClick={() => removeTag(tag)}>
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      <Input
        placeholder="Add tags (press Enter or comma)..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {input.length === 0 && tags.length === 0 && (
        <div className="flex flex-wrap gap-1">
          {SUGGESTED_TAGS.slice(0, 12).map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="cursor-pointer"
              onClick={() => addTag(tag)}
            >
              + {tag}
            </Badge>
          ))}
        </div>
      )}
      {input.length > 0 && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="cursor-pointer"
              onClick={() => addTag(tag)}
            >
              + {tag}
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 3: Build the recipe form component**

Create `src/components/features/recipe-form.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Upload } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { IngredientInput, type IngredientRow } from '@/components/features/ingredient-input'
import { TagInput } from '@/components/features/tag-input'

interface RecipeFormProps {
  householdId: string
  initialData?: {
    id: string
    title: string
    description: string | null
    servings: number
    prep_time: number | null
    cook_time: number | null
    instructions: string[]
    source_url: string | null
    recipe_ingredients: IngredientRow[]
    recipe_tags: { tag_name: string }[]
  }
}

export function RecipeForm({ householdId, initialData }: RecipeFormProps) {
  const router = useRouter()
  const isEditing = !!initialData

  const [title, setTitle] = useState(initialData?.title || '')
  const [description, setDescription] = useState(initialData?.description || '')
  const [servings, setServings] = useState(initialData?.servings || 4)
  const [prepTime, setPrepTime] = useState(initialData?.prep_time?.toString() || '')
  const [cookTime, setCookTime] = useState(initialData?.cook_time?.toString() || '')
  const [sourceUrl, setSourceUrl] = useState(initialData?.source_url || '')
  const [instructions, setInstructions] = useState<string[]>(
    initialData?.instructions?.length ? initialData.instructions : ['']
  )
  const [ingredients, setIngredients] = useState<IngredientRow[]>(
    initialData?.recipe_ingredients || []
  )
  const [tags, setTags] = useState<string[]>(
    initialData?.recipe_tags?.map((t) => t.tag_name) || []
  )
  const [saving, setSaving] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      setError('Recipe title is required')
      return
    }
    setSaving(true)
    setError(null)

    const body = {
      title: title.trim(),
      description: description.trim() || null,
      servings,
      prep_time: prepTime ? parseInt(prepTime) : null,
      cook_time: cookTime ? parseInt(cookTime) : null,
      instructions: instructions.filter((s) => s.trim()),
      source_url: sourceUrl.trim() || null,
      household_id: householdId,
      ingredients: ingredients.map((ing, idx) => ({
        ...ing,
        raw_text: ing.raw_text || buildRawText(ing),
        sort_order: idx,
      })),
      tags,
    }

    const url = isEditing ? `/api/recipes/${initialData.id}` : '/api/recipes'
    const method = isEditing ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const recipe = await res.json()
      router.push(`/recipes/${recipe.id}`)
      router.refresh()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to save recipe')
      setSaving(false)
    }
  }

  const handleImageExtract = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setExtracting(true)
    setError(null)

    const formData = new FormData()
    formData.append('image', file)

    try {
      const res = await fetch('/api/recipes/extract', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Extraction failed')
      }
      const result = await res.json()

      // Pre-populate form with extracted data
      setTitle(result.title || title)
      setDescription(result.description || description)
      if (result.servings) setServings(result.servings)
      if (result.prep_time) setPrepTime(result.prep_time.toString())
      if (result.cook_time) setCookTime(result.cook_time.toString())
      if (result.instructions?.length) setInstructions(result.instructions)
      if (result.ingredients?.length) {
        setIngredients(
          result.ingredients.map((ing: any) => ({
            raw_text: ing.raw_text || '',
            quantity: ing.quantity,
            unit: ing.unit,
            name: ing.name,
            group: ing.group || null,
            optional: false,
            notes: ing.notes,
          }))
        )
      }
      if (result.tags?.length) setTags(result.tags)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setExtracting(false)
    }
  }

  const updateInstruction = (idx: number, value: string) => {
    const updated = [...instructions]
    updated[idx] = value
    setInstructions(updated)
  }

  const addInstruction = () => setInstructions([...instructions, ''])

  const removeInstruction = (idx: number) => {
    if (instructions.length === 1) return
    setInstructions(instructions.filter((_, i) => i !== idx))
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Link href={isEditing ? `/recipes/${initialData.id}` : '/recipes'}>
          <Button variant="ghost" size="sm" type="button">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </Link>
        <h1 className="flex-1 text-2xl font-bold">
          {isEditing ? 'Edit Recipe' : 'New Recipe'}
        </h1>
      </div>

      {/* AI Extraction */}
      {!isEditing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Extract from Image</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-3 text-sm">
              Upload a photo of a recipe (cookbook page, screenshot, handwritten) and AI will extract the details.
            </p>
            <div className="flex items-center gap-3">
              <Input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleImageExtract}
                disabled={extracting}
              />
              {extracting && (
                <span className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Extracting...
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Basic Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Chicken Tikka Masala"
              required
            />
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description of the dish"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="servings">Servings</Label>
              <Input
                id="servings"
                type="number"
                min={1}
                value={servings}
                onChange={(e) => setServings(parseInt(e.target.value) || 4)}
              />
            </div>
            <div>
              <Label htmlFor="prep">Prep (min)</Label>
              <Input
                id="prep"
                type="number"
                min={0}
                value={prepTime}
                onChange={(e) => setPrepTime(e.target.value)}
                placeholder="15"
              />
            </div>
            <div>
              <Label htmlFor="cook">Cook (min)</Label>
              <Input
                id="cook"
                type="number"
                min={0}
                value={cookTime}
                onChange={(e) => setCookTime(e.target.value)}
                placeholder="30"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="source">Source URL</Label>
            <Input
              id="source"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Ingredients */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ingredients</CardTitle>
        </CardHeader>
        <CardContent>
          <IngredientInput ingredients={ingredients} onChange={setIngredients} />
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {instructions.map((step, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-muted-foreground mt-2.5 w-6 shrink-0 text-right text-sm">
                {idx + 1}.
              </span>
              <Input
                value={step}
                onChange={(e) => updateInstruction(idx, e.target.value)}
                placeholder={`Step ${idx + 1}`}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => removeInstruction(idx)}
                type="button"
                disabled={instructions.length === 1}
              >
                &times;
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addInstruction}>
            Add Step
          </Button>
        </CardContent>
      </Card>

      {/* Tags */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tags</CardTitle>
        </CardHeader>
        <CardContent>
          <TagInput tags={tags} onChange={setTags} />
        </CardContent>
      </Card>

      <Separator />

      <div className="flex justify-end gap-2">
        <Link href={isEditing ? `/recipes/${initialData.id}` : '/recipes'}>
          <Button variant="outline" type="button">Cancel</Button>
        </Link>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Save Changes' : 'Create Recipe'}
        </Button>
      </div>
    </form>
  )
}

function buildRawText(ing: IngredientRow): string {
  const parts: string[] = []
  if (ing.quantity != null) parts.push(ing.quantity.toString())
  if (ing.unit) parts.push(ing.unit)
  if (ing.name) parts.push(ing.name)
  if (ing.notes) parts.push(`, ${ing.notes}`)
  return parts.join(' ') || ''
}
```

**Step 4: Create the "new recipe" page**

Create `src/app/(dashboard)/recipes/new/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RecipeForm } from '@/components/features/recipe-form'

export default async function NewRecipePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .single()

  if (!profile?.default_household_id) redirect('/onboarding')

  return <RecipeForm householdId={profile.default_household_id} />
}
```

**Step 5: Create the "edit recipe" page**

Create `src/app/(dashboard)/recipes/[id]/edit/page.tsx`:

```tsx
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { RecipeForm } from '@/components/features/recipe-form'

export default async function EditRecipePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .single()

  if (!profile?.default_household_id) redirect('/onboarding')

  const { data: recipe, error } = await supabase
    .from('recipes')
    .select(`
      *,
      recipe_ingredients(*),
      recipe_tags(tag_name)
    `)
    .eq('id', id)
    .order('sort_order', { referencedTable: 'recipe_ingredients', ascending: true })
    .single()

  if (error || !recipe) notFound()

  return (
    <RecipeForm
      householdId={profile.default_household_id}
      initialData={recipe as any}
    />
  )
}
```

**Step 6: Commit**

```bash
git add src/components/features/recipe-form.tsx src/components/features/ingredient-input.tsx src/components/features/tag-input.tsx src/app/\(dashboard\)/recipes/new/ src/app/\(dashboard\)/recipes/\[id\]/edit/
git commit -m "feat: add recipe create/edit form with ingredient input, tag input, and AI extraction"
```

---

## Task 12: Recipe Image Upload

**Files:**
- Create: `src/app/api/recipes/[id]/images/route.ts`
- Modify: `src/components/features/recipe-form.tsx` (add image upload section)

**Step 1: Create the image upload API route**

Create `src/app/api/recipes/[id]/images/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/recipes/[id]/images — upload an image
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: recipeId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify recipe exists and user has access
  const { data: recipe } = await supabase
    .from('recipes')
    .select('id, household_id')
    .eq('id', recipeId)
    .single()

  if (!recipe) {
    return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
  }

  const formData = await request.formData()
  const file = formData.get('image') as File | null
  const imageType = (formData.get('type') as string) || 'photo'

  if (!file) {
    return NextResponse.json({ error: 'No image provided' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${recipe.household_id}/${recipeId}/${crypto.randomUUID()}.${ext}`

  const bytes = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('recipe-images')
    .upload(path, bytes, { contentType: file.type })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: { publicUrl } } = supabase.storage
    .from('recipe-images')
    .getPublicUrl(path)

  // Get next sort order
  const { count } = await supabase
    .from('recipe_images')
    .select('*', { count: 'exact', head: true })
    .eq('recipe_id', recipeId)

  const { data: image, error: dbError } = await supabase
    .from('recipe_images')
    .insert({
      recipe_id: recipeId,
      url: publicUrl,
      type: imageType,
      sort_order: count || 0,
    })
    .select()
    .single()

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json(image, { status: 201 })
}

// DELETE /api/recipes/[id]/images — delete an image
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: recipeId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const imageId = searchParams.get('imageId')
  if (!imageId) {
    return NextResponse.json({ error: 'imageId is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('recipe_images')
    .delete()
    .eq('id', imageId)
    .eq('recipe_id', recipeId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

**Step 2: Commit**

```bash
git add src/app/api/recipes/\[id\]/images/route.ts
git commit -m "feat: add recipe image upload and delete API"
```

---

## Task 13: Seed Data — Sample Recipes

**Files:**
- Modify: `supabase/seed.sql`

**Step 1: Add sample recipe seed data**

Append to `supabase/seed.sql` (this runs after a test user creates a household via the app):

```sql
-- ============================================================
-- SAMPLE RECIPES (requires a household to exist)
-- Run after creating a test user + household via the app.
-- These use a placeholder household_id and profile_id.
-- Replace with real IDs from your local dev environment.
-- ============================================================

-- To use:
-- 1. Sign up via the app at http://localhost:3000/signup
-- 2. Create a household via onboarding
-- 3. Find your profile ID and household ID in Supabase Studio (http://localhost:54323)
-- 4. Run: psql -h localhost -p 54322 -U postgres -d postgres < supabase/seed-recipes.sql
-- Or paste in Studio SQL editor after replacing the IDs below.

-- Example (uncomment and replace IDs):
-- INSERT INTO recipes (title, description, servings, prep_time, cook_time, instructions, household_id, created_by) VALUES
-- ('Chicken Tikka Masala', 'Classic British-Indian curry', 4, 20, 35, '["Marinate chicken in yoghurt and spices", "Grill or pan-fry chicken pieces", "Make sauce: fry onions, add tomatoes and cream", "Combine chicken with sauce and simmer"]'::jsonb, 'YOUR_HOUSEHOLD_ID', 'YOUR_PROFILE_ID'),
-- ('Spaghetti Bolognese', 'Simple family bolognese', 4, 10, 45, '["Fry onion, carrot, and celery", "Brown the mince", "Add tinned tomatoes and herbs", "Simmer for 30 minutes", "Cook spaghetti and serve"]'::jsonb, 'YOUR_HOUSEHOLD_ID', 'YOUR_PROFILE_ID');
```

**Step 2: Commit**

```bash
git add supabase/seed.sql
git commit -m "docs: add recipe seed data instructions"
```

---

## Task 14: Environment Variable for Anthropic API Key

**Files:**
- Modify: `.env.local` (do NOT commit this file)

**Step 1: Add the Anthropic API key**

Add to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

The `@anthropic-ai/sdk` reads `ANTHROPIC_API_KEY` from the environment automatically.

**Step 2: Verify `.env.local` is in `.gitignore`**

```bash
grep ".env.local" .gitignore
```

Expected: `.env.local` is listed.

No commit needed — `.env.local` is not tracked.

---

## Task 15: Build Verification and Integration Test

**Step 1: Run all unit tests**

```bash
npm run test:run
```

Expected: All tests pass (units, scaling, ingredients, extraction validation).

**Step 2: Run the build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

**Step 3: Manual smoke test**

1. Start local Supabase: `npx supabase start`
2. Start dev server: `npm run dev`
3. Sign in at `http://localhost:3000/login`
4. Navigate to `/recipes` — should see empty state with "Add Recipe" button
5. Click "Add Recipe" — should see recipe form with all sections
6. Fill in a recipe manually and save — should redirect to detail page
7. Verify ingredient scaling works (click +/- servings)
8. Edit the recipe — should pre-populate form
9. Delete the recipe — should redirect to recipe list

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete phase 2 recipes implementation"
```

---

## Summary

| Task | Description | Key Files |
|------|-------------|-----------|
| 1 | Database migration | `supabase/migrations/00002_recipes.sql` |
| 2 | TypeScript types | `src/types/database.ts` |
| 3 | Unit conversion | `src/lib/utils/units.ts` |
| 4 | Recipe scaling | `src/lib/utils/scaling.ts` |
| 5 | Ingredient parsing | `src/lib/utils/ingredients.ts` |
| 6 | Recipe CRUD API | `src/app/api/recipes/route.ts`, `[id]/route.ts` |
| 7 | Claude vision extraction | `src/lib/ai/extract-recipe.ts`, `api/recipes/extract/route.ts` |
| 8 | shadcn/ui components | `src/components/ui/*` |
| 9 | Recipe list page | `src/app/(dashboard)/recipes/page.tsx` |
| 10 | Recipe detail page | `src/app/(dashboard)/recipes/[id]/page.tsx` |
| 11 | Recipe form (create + edit) | `src/components/features/recipe-form.tsx` |
| 12 | Image upload API | `src/app/api/recipes/[id]/images/route.ts` |
| 13 | Seed data | `supabase/seed.sql` |
| 14 | Environment setup | `.env.local` |
| 15 | Build verification | Manual smoke test |
