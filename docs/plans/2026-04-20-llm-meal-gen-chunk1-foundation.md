# LLM Meal Generation — Chunk 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the database schema, seed data, and TypeScript types for LLM-assisted meal planning, without any runtime code yet.

**Architecture:** Two sequential Supabase migrations: one for schema (new tables + column additions), one for data (UK packet sizes seed). No behavior changes — existing app keeps running unchanged. All follow-on chunks (server LLM loop, UI, packet rounding) consume what this chunk sets up.

**Tech Stack:** Supabase Postgres, Supabase CLI, TypeScript, Vitest, Zod.

**Spec:** `docs/plans/2026-04-20-llm-meal-generation-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/00016_meal_gen_schema.sql` | New tables (`meal_gen_conversations`, `meal_gen_drafts`, `packet_sizes`) + column additions on `meal_plan_entries` and `todo_items` + RLS |
| `supabase/migrations/00017_packet_sizes_seed.sql` | Global UK packet-size rows (INSERTs) |
| `supabase/seed_data/packet_sizes_uk.json` | Source-of-truth JSON for the seed; the migration is generated from this |
| `src/types/meal-gen.ts` | TypeScript interfaces for new entities and helper types consumed by upcoming chunks |
| `src/lib/utils/packet-sizes-seed.test.ts` | Vitest: validates JSON shape with a Zod schema |

### Modified Files

| File | Changes |
|------|---------|
| `src/types/database.ts` | Regenerated (or hand-patched) to include new tables + columns |
| `src/types/todos.ts` | Add optional `metadata?: Record<string, unknown> \| null` to `TodoItem` |
| `CLAUDE.md` | Note `src/lib/ai/meal-plan/` as upcoming extraction-boundary module and mention new `packet_sizes` table |

---

## Conventions Already in This Repo

Use these — do not invent new ones:

- Migrations are **lowercase SQL**, one file per numbered change, e.g. `create table if not exists public.foo (...)`.
- RLS policies use helper `public.get_my_household_ids()` and four policies per table (`household_read`, `household_insert`, `household_update`, `household_delete`).
- `updated_at` columns get a trigger: `create trigger X_updated_at before update on public.X for each row execute function public.update_updated_at();`.
- `uuid primary key default gen_random_uuid()`.
- Vitest specs live next to source: `foo.ts` + `foo.test.ts`.
- Tests run with `npm run test:run` (non-watch) or `npm run test` (watch).
- Local dev commands are run via `doppler run --`. Plain `npm` commands also work for test/build since those don't need secrets.

---

## Tasks

### Task 1: Write the schema migration

**Files:**
- Create: `supabase/migrations/00016_meal_gen_schema.sql`

- [ ] **Step 1: Create the migration file with full contents**

Create `supabase/migrations/00016_meal_gen_schema.sql`:

```sql
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
```

- [ ] **Step 2: Syntax-check the file**

Run: `grep -cE '^\s*(create|alter|--)' supabase/migrations/00016_meal_gen_schema.sql`
Expected: non-zero count (just confirms the file has the expected statement prefixes).

If you have a local Postgres available, also run:
```bash
psql -d postgres -c "$(cat supabase/migrations/00016_meal_gen_schema.sql)" --single-transaction --dry-run 2>&1 | head
```
Expected: no parse errors. (Skip if Docker/local Postgres unavailable per CLAUDE.md WSL2 note; verification defers to staging Supabase.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00016_meal_gen_schema.sql
git commit -m "feat(db): add meal gen schema (conversations, drafts, packet_sizes)"
```

---

### Task 2: Write packet-sizes seed JSON with Zod validation test

**Files:**
- Create: `supabase/seed_data/packet_sizes_uk.json`
- Create: `src/lib/utils/packet-sizes-seed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/utils/packet-sizes-seed.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

const PacketSizeSchema = z.object({
  ingredient_name: z.string().min(1),
  pack_quantity: z.number().positive(),
  pack_unit: z.string().min(1),
  locale: z.literal('UK'),
  is_default: z.boolean(),
  notes: z.string().nullable().optional(),
})

const SeedSchema = z.array(PacketSizeSchema).min(20)

describe('packet_sizes_uk.json seed', () => {
  const raw = readFileSync(
    resolve(__dirname, '../../../supabase/seed_data/packet_sizes_uk.json'),
    'utf8',
  )
  const data: unknown = JSON.parse(raw)

  it('matches the PacketSizeSchema', () => {
    expect(() => SeedSchema.parse(data)).not.toThrow()
  })

  it('has exactly one default per ingredient_name', () => {
    const parsed = SeedSchema.parse(data)
    const defaultsByName = new Map<string, number>()
    for (const row of parsed) {
      if (row.is_default) {
        defaultsByName.set(row.ingredient_name, (defaultsByName.get(row.ingredient_name) ?? 0) + 1)
      }
    }
    for (const [name, count] of defaultsByName) {
      expect(count, `ingredient "${name}" has ${count} defaults`).toBe(1)
    }
  })

  it('uses normalized lowercase singular ingredient_names', () => {
    const parsed = SeedSchema.parse(data)
    for (const row of parsed) {
      expect(row.ingredient_name).toBe(row.ingredient_name.toLowerCase())
      expect(row.ingredient_name).not.toMatch(/\s{2,}/)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:run -- src/lib/utils/packet-sizes-seed.test.ts`
Expected: FAIL with ENOENT (file not found) or JSON parse error.

- [ ] **Step 3: Create the seed JSON**

Create `supabase/seed_data/packet_sizes_uk.json`:

```json
[
  { "ingredient_name": "carrot", "pack_quantity": 1, "pack_unit": "kg", "locale": "UK", "is_default": true, "notes": "common loose bag" },
  { "ingredient_name": "carrot", "pack_quantity": 500, "pack_unit": "g", "locale": "UK", "is_default": false, "notes": "small bag" },
  { "ingredient_name": "onion", "pack_quantity": 3, "pack_unit": "ct", "locale": "UK", "is_default": true, "notes": "3-pack brown onions" },
  { "ingredient_name": "red onion", "pack_quantity": 3, "pack_unit": "ct", "locale": "UK", "is_default": true, "notes": "3-pack" },
  { "ingredient_name": "garlic", "pack_quantity": 1, "pack_unit": "ct", "locale": "UK", "is_default": true, "notes": "single bulb" },
  { "ingredient_name": "potato", "pack_quantity": 2.5, "pack_unit": "kg", "locale": "UK", "is_default": true, "notes": "maris piper bag" },
  { "ingredient_name": "pepper", "pack_quantity": 3, "pack_unit": "ct", "locale": "UK", "is_default": true, "notes": "mixed 3-pack" },
  { "ingredient_name": "tomato", "pack_quantity": 6, "pack_unit": "ct", "locale": "UK", "is_default": true, "notes": "6-pack salad tomatoes" },
  { "ingredient_name": "cherry tomato", "pack_quantity": 250, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "punnet" },
  { "ingredient_name": "cucumber", "pack_quantity": 1, "pack_unit": "ct", "locale": "UK", "is_default": true },
  { "ingredient_name": "lettuce", "pack_quantity": 1, "pack_unit": "ct", "locale": "UK", "is_default": true, "notes": "head" },
  { "ingredient_name": "spinach", "pack_quantity": 240, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "bagged" },
  { "ingredient_name": "broccoli", "pack_quantity": 1, "pack_unit": "ct", "locale": "UK", "is_default": true, "notes": "head ~350g" },
  { "ingredient_name": "courgette", "pack_quantity": 2, "pack_unit": "ct", "locale": "UK", "is_default": true, "notes": "2-pack" },
  { "ingredient_name": "mushroom", "pack_quantity": 250, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "punnet" },
  { "ingredient_name": "lemon", "pack_quantity": 5, "pack_unit": "ct", "locale": "UK", "is_default": true, "notes": "5-pack" },
  { "ingredient_name": "lime", "pack_quantity": 4, "pack_unit": "ct", "locale": "UK", "is_default": true },
  { "ingredient_name": "chicken breast", "pack_quantity": 600, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "2-breast pack" },
  { "ingredient_name": "chicken thigh", "pack_quantity": 500, "pack_unit": "g", "locale": "UK", "is_default": true },
  { "ingredient_name": "beef mince", "pack_quantity": 500, "pack_unit": "g", "locale": "UK", "is_default": true },
  { "ingredient_name": "pork mince", "pack_quantity": 500, "pack_unit": "g", "locale": "UK", "is_default": true },
  { "ingredient_name": "sausage", "pack_quantity": 6, "pack_unit": "ct", "locale": "UK", "is_default": true, "notes": "6-pack" },
  { "ingredient_name": "bacon", "pack_quantity": 240, "pack_unit": "g", "locale": "UK", "is_default": true },
  { "ingredient_name": "salmon fillet", "pack_quantity": 240, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "2-fillet pack" },
  { "ingredient_name": "cod fillet", "pack_quantity": 260, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "2-fillet pack" },
  { "ingredient_name": "egg", "pack_quantity": 6, "pack_unit": "ct", "locale": "UK", "is_default": true, "notes": "6-pack" },
  { "ingredient_name": "egg", "pack_quantity": 12, "pack_unit": "ct", "locale": "UK", "is_default": false, "notes": "12-pack" },
  { "ingredient_name": "milk", "pack_quantity": 2, "pack_unit": "l", "locale": "UK", "is_default": true, "notes": "2L bottle" },
  { "ingredient_name": "milk", "pack_quantity": 1, "pack_unit": "l", "locale": "UK", "is_default": false, "notes": "1L bottle" },
  { "ingredient_name": "butter", "pack_quantity": 250, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "block" },
  { "ingredient_name": "cheddar", "pack_quantity": 400, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "block" },
  { "ingredient_name": "parmesan", "pack_quantity": 180, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "wedge" },
  { "ingredient_name": "cream", "pack_quantity": 300, "pack_unit": "ml", "locale": "UK", "is_default": true, "notes": "double cream tub" },
  { "ingredient_name": "yoghurt", "pack_quantity": 500, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "greek yoghurt" },
  { "ingredient_name": "bread", "pack_quantity": 800, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "medium loaf" },
  { "ingredient_name": "pasta", "pack_quantity": 500, "pack_unit": "g", "locale": "UK", "is_default": true },
  { "ingredient_name": "rice", "pack_quantity": 1, "pack_unit": "kg", "locale": "UK", "is_default": true, "notes": "basmati bag" },
  { "ingredient_name": "flour", "pack_quantity": 1.5, "pack_unit": "kg", "locale": "UK", "is_default": true, "notes": "plain flour" },
  { "ingredient_name": "chopped tomato", "pack_quantity": 400, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "tin" },
  { "ingredient_name": "chickpea", "pack_quantity": 400, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "tin drained ~240g" },
  { "ingredient_name": "kidney bean", "pack_quantity": 400, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "tin" },
  { "ingredient_name": "coconut milk", "pack_quantity": 400, "pack_unit": "ml", "locale": "UK", "is_default": true, "notes": "tin" },
  { "ingredient_name": "olive oil", "pack_quantity": 500, "pack_unit": "ml", "locale": "UK", "is_default": true },
  { "ingredient_name": "soy sauce", "pack_quantity": 150, "pack_unit": "ml", "locale": "UK", "is_default": true },
  { "ingredient_name": "stock cube", "pack_quantity": 8, "pack_unit": "ct", "locale": "UK", "is_default": true },
  { "ingredient_name": "pesto", "pack_quantity": 190, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "jar" },
  { "ingredient_name": "basil", "pack_quantity": 30, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "fresh packet" },
  { "ingredient_name": "coriander", "pack_quantity": 30, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "fresh packet" },
  { "ingredient_name": "parsley", "pack_quantity": 30, "pack_unit": "g", "locale": "UK", "is_default": true, "notes": "fresh packet" },
  { "ingredient_name": "apple", "pack_quantity": 6, "pack_unit": "ct", "locale": "UK", "is_default": true, "notes": "bag" },
  { "ingredient_name": "banana", "pack_quantity": 5, "pack_unit": "ct", "locale": "UK", "is_default": true, "notes": "bunch" }
]
```

- [ ] **Step 4: Install Zod** (already installed per package.json — verify)

Run: `grep -E '"zod"' package.json`
Expected: line showing `"zod": "^4.3.6"`.

If missing (it should be present), run: `npm install zod` and commit the lockfile change.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:run -- src/lib/utils/packet-sizes-seed.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase/seed_data/packet_sizes_uk.json src/lib/utils/packet-sizes-seed.test.ts
git commit -m "feat(data): add UK packet sizes seed with zod validation"
```

---

### Task 3: Generate the seed migration from the JSON

**Files:**
- Create: `supabase/migrations/00017_packet_sizes_seed.sql`

- [ ] **Step 1: Write a one-shot script to generate the migration**

Create `scripts/generate-packet-sizes-migration.ts` (root-level `scripts/` is fine — does not ship in the Next.js build):

```typescript
// Run with: npx tsx scripts/generate-packet-sizes-migration.ts
// Reads the JSON seed and emits a Supabase migration SQL file.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const seedPath = resolve(__dirname, '../supabase/seed_data/packet_sizes_uk.json')
const outPath = resolve(__dirname, '../supabase/migrations/00017_packet_sizes_seed.sql')

type Row = {
  ingredient_name: string
  pack_quantity: number
  pack_unit: string
  locale: string
  is_default: boolean
  notes?: string | null
}

const rows = JSON.parse(readFileSync(seedPath, 'utf8')) as Row[]

const esc = (s: string) => s.replace(/'/g, "''")

const values = rows
  .map(
    (r) =>
      `  ('${esc(r.ingredient_name)}', ${r.pack_quantity}, '${esc(r.pack_unit)}', '${esc(r.locale)}', ${r.is_default}, ${r.notes ? `'${esc(r.notes)}'` : 'null'})`,
  )
  .join(',\n')

const sql = `-- 00017_packet_sizes_seed.sql
-- AUTOGENERATED from supabase/seed_data/packet_sizes_uk.json.
-- Regenerate with: npx tsx scripts/generate-packet-sizes-migration.ts

insert into public.packet_sizes
  (ingredient_name, pack_quantity, pack_unit, locale, is_default, notes)
values
${values}
on conflict do nothing;
`

writeFileSync(outPath, sql)
console.log(`Wrote ${rows.length} rows to ${outPath}`)
```

- [ ] **Step 2: Install tsx** (if not already available)

Run: `npx tsx --version`
Expected: version number. If "not found", run `npm install --save-dev tsx` and commit the lockfile change.

- [ ] **Step 3: Run the generator**

Run: `npx tsx scripts/generate-packet-sizes-migration.ts`
Expected output: `Wrote 50 rows to /home/sean/code/lemons/supabase/migrations/00017_packet_sizes_seed.sql`

- [ ] **Step 4: Verify the migration file looks sensible**

Run: `head -20 supabase/migrations/00017_packet_sizes_seed.sql`
Expected: header comment + `insert into public.packet_sizes` + `values` + at least one tuple.

Run: `grep -c "^  (" supabase/migrations/00017_packet_sizes_seed.sql`
Expected: 50.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-packet-sizes-migration.ts supabase/migrations/00017_packet_sizes_seed.sql package.json package-lock.json
git commit -m "feat(data): add packet sizes seed migration + generator script"
```

---

### Task 4: Regenerate Supabase TypeScript types

**Files:**
- Modify: `src/types/database.ts`

The `Database` type in `src/types/database.ts` is auto-generated from the live schema. Two regeneration paths exist depending on what's available locally. Try them in order; skip to the next on failure.

- [ ] **Step 1: Try local Supabase regen (may be unavailable on WSL2 per CLAUDE.md)**

Run:
```bash
doppler run -- npx supabase start
doppler run -- npx supabase db reset
doppler run -- npx supabase gen types typescript --local > src/types/database.ts
```

Expected: `database.ts` now contains entries for `meal_gen_conversations`, `meal_gen_drafts`, `packet_sizes`, and the new columns on `meal_plan_entries` and `todo_items`.

If `supabase start` errors with Docker/WSL issues → abort these commands and use Step 2.

- [ ] **Step 2: Fallback — regen against staging project**

Staging Supabase already has migrations auto-applied from main. Apply these branches' migrations to staging first (ideally via a preview PR), then regenerate:

```bash
doppler run --config stg -- npx supabase gen types typescript --project-id "$SUPABASE_STAGING_PROJECT_ID" > src/types/database.ts
```

(The `SUPABASE_STAGING_PROJECT_ID` should exist in the `stg` Doppler config; if not, grab the project ref from `supabase/config.toml` or the Supabase dashboard URL and run with `--project-id <ref>` directly.)

If staging does not yet have these migrations, push them there first:
```bash
doppler run --config stg -- npx supabase db push
```

- [ ] **Step 3: Verify regenerated types contain the new entities**

Run:
```bash
grep -c "meal_gen_conversations\|meal_gen_drafts\|packet_sizes" src/types/database.ts
```
Expected: ≥ 9 matches (3 table names appear multiple times — table def, Row, Insert, Update, Relationships).

Run: `grep -n "custom_ingredients\|inventory_item_id" src/types/database.ts | head`
Expected: matches inside the `meal_plan_entries` block.

Run: `grep -n "metadata" src/types/database.ts | head`
Expected: matches inside the `todo_items` block (plus `meal_gen_conversations`).

- [ ] **Step 4: Run TypeScript build**

Run: `npm run build`
Expected: build succeeds. No new TS errors introduced.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts
git commit -m "chore(types): regenerate database.ts for meal gen schema"
```

---

### Task 5: Add hand-written TypeScript interfaces for meal gen

**Files:**
- Create: `src/types/meal-gen.ts`
- Modify: `src/types/todos.ts`

These supplement the generated `Database` type with app-level shapes (tool call payloads, message envelopes) that don't map 1-to-1 to DB rows. Keeping them hand-written keeps chunk 2 (server LLM loop) from needing to invent them ad-hoc.

- [ ] **Step 1: Create `src/types/meal-gen.ts`**

```typescript
import type { Database } from './database'

// DB row aliases
export type MealGenConversationRow = Database['public']['Tables']['meal_gen_conversations']['Row']
export type MealGenDraftRow = Database['public']['Tables']['meal_gen_drafts']['Row']
export type PacketSizeRow = Database['public']['Tables']['packet_sizes']['Row']

// Conversation message envelope (stored inside meal_gen_conversations.messages jsonb)
export type MealGenMessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface MealGenMessage {
  role: MealGenMessageRole
  content: string
  tool_calls?: MealGenToolCall[]
  tool_results?: MealGenToolResult[]
  ts: string // ISO timestamp
}

export interface MealGenToolCall {
  id: string
  name: MealGenToolName
  input: Record<string, unknown>
}

export interface MealGenToolResult {
  tool_call_id: string
  content: unknown
  is_error?: boolean
}

// Tool names exposed to the LLM. Implementations land in chunk 2.
export type MealGenToolName =
  | 'get_recipe'
  | 'search_web'
  | 'scrape_and_save_recipe'
  | 'search_inventory_leftovers'
  | 'get_calendar_events'
  | 'check_packet_sizes'
  | 'propose_plan'
  | 'remove_slot'

// Custom-ingredient shape (stored in meal_gen_drafts.custom_ingredients and meal_plan_entries.custom_ingredients).
export interface CustomIngredient {
  name: string
  quantity: number | null
  unit: string | null
}

// Packet rounding metadata (lives on todo_items.metadata for shopping items).
export interface PacketRoundingMetadata {
  required_qty: number
  packed_qty: number
  waste_qty: number
  pack_size: { quantity: number; unit: string }
}

// Draft source discriminator — matches the CHECK on meal_gen_drafts.source.
export type MealGenDraftSource =
  | 'recipe'
  | 'custom'
  | 'custom_with_ingredients'
  | 'leftover'
```

- [ ] **Step 2: Add `metadata` to the `TodoItem` interface**

Open `src/types/todos.ts` and locate the `TodoItem` interface (currently around lines 25–40). Add `metadata` right after `group_name`:

```typescript
export interface TodoItem {
  id: string
  list_id: string
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'completed'
  priority: 'none' | 'low' | 'medium' | 'high' | 'urgent'
  due_date: string | null
  assigned_to: string | null
  created_by: string
  sort_order: number
  group_name?: string | null
  metadata?: Record<string, unknown> | null
  completed_at: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 3: Run TypeScript build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Run full test suite to catch accidental regressions**

Run: `npm run test:run`
Expected: all tests pass (including the `packet-sizes-seed.test.ts` from Task 2).

- [ ] **Step 5: Commit**

```bash
git add src/types/meal-gen.ts src/types/todos.ts
git commit -m "feat(types): add meal gen interfaces and TodoItem metadata"
```

---

### Task 6: Update CLAUDE.md with new structural notes

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add a note under Architecture → Approach B Escape Hatch**

Open `CLAUDE.md`. Locate the bullet list after "To migrate to Approach B:" and its context. Find the line that reads `- \`lib/ai/\` — Claude API integration. First extraction candidate.` Add the meal-plan sub-module mention immediately after:

Before:
```
- `lib/ai/` — Claude API integration. First extraction candidate.
- `lib/utils/` — Business logic (scaling, unit conversion, inventory matching). Second candidate.
```

After:
```
- `lib/ai/` — Claude API integration. First extraction candidate.
  - `lib/ai/meal-plan/` — LLM-assisted meal plan generation (conversation loop, tools). Highest-value extraction target given token volume.
- `lib/utils/` — Business logic (scaling, unit conversion, inventory matching). Second candidate.
```

- [ ] **Step 2: Add a note under Key Conventions**

Append this bullet to the "Key Conventions" list in `CLAUDE.md`:

```
- **Packet sizes** live in `packet_sizes` (global rows, `household_id IS NULL`) with optional household overrides. Seeded from `supabase/seed_data/packet_sizes_uk.json` via `supabase/migrations/00017_packet_sizes_seed.sql` (regenerate with `npx tsx scripts/generate-packet-sizes-migration.ts`).
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): note meal-plan module and packet_sizes conventions"
```

---

### Task 7: Final verification of chunk 1

- [ ] **Step 1: Run full test suite**

Run: `npm run test:run`
Expected: all tests pass.

- [ ] **Step 2: Run TypeScript build**

Run: `npm run build`
Expected: build succeeds with no TS errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: passes with no errors (warnings acceptable if they pre-existed).

- [ ] **Step 4: Git log sanity check**

Run: `git log --oneline -10`
Expected: six new commits from tasks 1–6, in order, all on `main` or the chunk-1 branch.

- [ ] **Step 5: Verify migration order integrity**

Run: `ls -1 supabase/migrations/ | tail -5`
Expected: ends with `00015_todos_completion.sql`, `00016_meal_gen_schema.sql`, `00017_packet_sizes_seed.sql`.

No commit for this task — it's verification only. Chunk 1 is complete.

---

## Post-Chunk-1 Notes

- Nothing in this chunk changes user-visible behavior. Existing flows keep working.
- `packet_sizes`, `meal_gen_conversations`, `meal_gen_drafts` stay empty for end users until chunk 2 wires up the API.
- Staging deploy will auto-run migrations 00016 + 00017. Production is gated until chunk 4 and explicit flag flip.
- Next plan to write: **Chunk 2 — Server-side LLM loop** (tool implementations, `/api/meal-plans/generate*` routes, conversation persistence, `MEAL_GEN_ENABLED` flag).
