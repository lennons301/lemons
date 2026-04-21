# LLM Meal Generation — Chunk 2a: Library Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the library layer for LLM-assisted meal planning — tool implementations, system prompt, catalog index, and conversation orchestrator — with no HTTP surface yet.

**Architecture:** A new `src/lib/ai/meal-plan/` module. Each tool is a standalone function taking a `ToolContext` (supabase client, householdId, conversationId) plus typed input. The conversation orchestrator runs a turn loop: builds the cached system prompt, calls Anthropic, executes any tool calls, feeds results back, repeats until the model stops calling tools. No HTTP, no streaming, no persistence of the conversation itself — that's chunk 2b. Library code can be unit-tested independently using a fake Anthropic client.

**Tech Stack:** TypeScript, Anthropic SDK (`@anthropic-ai/sdk` ^0.78.0), Supabase, Vitest.

**Spec:** `docs/plans/2026-04-20-llm-meal-generation-design.md`
**Chunk 1 (done):** `docs/plans/2026-04-20-llm-meal-gen-chunk1-foundation.md`
**Chunk 2b (future):** API routes, streaming, accept flow, cost caps.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/ai/meal-plan/config.ts` | `MEAL_GEN_ENABLED` env flag + other module-level constants (token budgets, cache control settings) |
| `src/lib/ai/meal-plan/types.ts` | Internal types: `ToolContext`, `ToolResult`, `ConversationState`, `ProposedEntry` |
| `src/lib/ai/meal-plan/catalog-index.ts` | Build compact household-recipe index string (one line per recipe, `[r:id] title \| tag1, tag2, ...`) |
| `src/lib/ai/meal-plan/prompt.ts` | Build the cached system prompt (household context + catalog + planning guidelines) |
| `src/lib/ai/meal-plan/tool-schemas.ts` | Anthropic tool definitions (JSON schemas) for all 8 tools |
| `src/lib/ai/meal-plan/tools/get-recipe.ts` | Fetch full recipe by id |
| `src/lib/ai/meal-plan/tools/check-packet-sizes.ts` | Return pack sizes for given ingredient names |
| `src/lib/ai/meal-plan/tools/search-inventory-leftovers.ts` | Return cooked-meal inventory items with remaining servings |
| `src/lib/ai/meal-plan/tools/get-calendar-events.ts` | Return calendar events in a date window |
| `src/lib/ai/meal-plan/tools/propose-plan.ts` | Upsert draft entries into `meal_gen_drafts` |
| `src/lib/ai/meal-plan/tools/remove-slot.ts` | Delete a draft slot |
| `src/lib/ai/meal-plan/tools/scrape-and-save-recipe.ts` | Fetch URL, extract via `extractRecipeFromUrl`, persist to `recipes` |
| `src/lib/ai/meal-plan/tools/index.ts` | Tool registry — maps tool names to implementations, exposes dispatcher |
| `src/lib/ai/meal-plan/conversation.ts` | Main turn orchestrator: `runTurn(state, userMessage, context) => TurnResult` |
| `src/lib/ai/extract-recipe-from-url.ts` | New function: fetch HTML, clean, extract via Claude. Used by `scrape-and-save-recipe`. |
| Companion `*.test.ts` files | Colocated unit tests for each module above |

### Modified Files

| File | Changes |
|------|---------|
| `src/types/meal-gen.ts` | Add `ToolContext`, `ToolResult`, `ProposedEntry`, `TurnResult` interfaces (internal) |

---

## Conventions

- **Existing Anthropic SDK pattern:** see `src/lib/ai/extract-recipe.ts` — model id `claude-sonnet-4-20250514` is what this repo currently uses. Keep that default for consistency; no upgrade in scope.
- **Existing API-key lookup:** household Anthropic key lives on `households.anthropic_api_key` (not a separate table). See `src/app/api/recipes/extract/route.ts:41-48`.
- **Supabase client:** server-side calls use `createClient()` from `src/lib/supabase/server.ts`, which respects RLS via the user's session cookies.
- **Test style:** Vitest, colocated. See `src/lib/ai/extract-recipe.test.ts` for pattern (mocks the Anthropic client constructor).
- **Tool impls take a `ToolContext`** — never read `cookies()` or global state directly; always go through the context object so tests can inject fakes.

---

## ToolContext contract (used by every tool)

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

export interface ToolContext {
  supabase: SupabaseClient<Database>
  householdId: string
  userId: string
  conversationId: string
}

export interface ToolResult<T = unknown> {
  content: T       // serialized as JSON back to the model
  is_error?: boolean
}
```

---

## Tasks

### Task 1: Module scaffolding and config

**Files:**
- Create: `src/lib/ai/meal-plan/config.ts`
- Create: `src/lib/ai/meal-plan/types.ts`
- Modify: `src/types/meal-gen.ts` (append internal types)

- [ ] **Step 1: Create `src/lib/ai/meal-plan/config.ts`**

```typescript
export const MEAL_GEN_MODEL = 'claude-sonnet-4-20250514'
export const MEAL_GEN_ENABLED = process.env.MEAL_GEN_ENABLED === 'true'
export const MEAL_GEN_MAX_TOKENS = 4096
export const MEAL_GEN_MAX_TOOL_TURNS = 20
export const MEAL_GEN_RECIPE_ID_PREFIX = 'r:'
```

- [ ] **Step 2: Create `src/lib/ai/meal-plan/types.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { MealGenMessage, MealGenDraftSource } from '@/types/meal-gen'

export interface ToolContext {
  supabase: SupabaseClient<Database>
  householdId: string
  userId: string
  conversationId: string
}

export interface ToolResult<T = unknown> {
  content: T
  is_error?: boolean
}

export interface ProposedEntry {
  date: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  source: MealGenDraftSource
  recipe_id?: string | null
  inventory_item_id?: string | null
  custom_name?: string | null
  custom_ingredients?: Array<{ name: string; quantity: number | null; unit: string | null }> | null
  servings?: number
  assigned_to?: string[]
  notes?: string | null
}

export interface TurnResult {
  assistantMessages: MealGenMessage[]
  stoppedReason: 'end_turn' | 'max_tokens' | 'tool_cap' | 'error'
  toolCallsMade: number
  tokensIn: number
  tokensOut: number
}
```

- [ ] **Step 3: Append usage note to `src/types/meal-gen.ts`**

Add this export at the bottom of `src/types/meal-gen.ts`:

```typescript
// Re-export internal types for convenience
export type { ToolContext, ToolResult, ProposedEntry, TurnResult } from '@/lib/ai/meal-plan/types'
```

- [ ] **Step 4: Build to verify**

Run: `doppler run -- npm run build`
Expected: succeeds, no TS errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/config.ts src/lib/ai/meal-plan/types.ts src/types/meal-gen.ts
git commit -m "feat(meal-gen): add module config and internal types"
```

---

### Task 2: Catalog index builder

Compact per-recipe line for the cached system prompt: `[r:<id>] <title> | <tag>, <tag>, ...`.

**Files:**
- Create: `src/lib/ai/meal-plan/catalog-index.ts`
- Create: `src/lib/ai/meal-plan/catalog-index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/catalog-index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildCatalogIndex, type CatalogRecipe } from './catalog-index'

describe('buildCatalogIndex', () => {
  it('returns empty string for empty input', () => {
    expect(buildCatalogIndex([])).toBe('')
  })

  it('formats a single recipe with tags', () => {
    const recipes: CatalogRecipe[] = [
      { id: 'abc-123', title: 'Thai Green Curry', tags: ['thai', 'curry', 'chicken'] },
    ]
    expect(buildCatalogIndex(recipes)).toBe('[r:abc-123] Thai Green Curry | thai, curry, chicken')
  })

  it('joins multiple recipes with newlines', () => {
    const recipes: CatalogRecipe[] = [
      { id: 'a', title: 'First', tags: ['tag1'] },
      { id: 'b', title: 'Second', tags: [] },
    ]
    expect(buildCatalogIndex(recipes)).toBe('[r:a] First | tag1\n[r:b] Second | ')
  })

  it('sanitizes pipes and newlines in title to keep lines single-line', () => {
    const recipes: CatalogRecipe[] = [
      { id: 'x', title: 'Pasta | with\nsauce', tags: [] },
    ]
    expect(buildCatalogIndex(recipes)).toBe('[r:x] Pasta   with sauce | ')
  })

  it('sorts by title ascending for stable caching', () => {
    const recipes: CatalogRecipe[] = [
      { id: 'b', title: 'Beta', tags: [] },
      { id: 'a', title: 'Alpha', tags: [] },
    ]
    expect(buildCatalogIndex(recipes).split('\n')[0]).toContain('Alpha')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/catalog-index.test.ts`
Expected: FAIL with "Cannot find module './catalog-index'".

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/catalog-index.ts`:

```typescript
import { MEAL_GEN_RECIPE_ID_PREFIX } from './config'

export interface CatalogRecipe {
  id: string
  title: string
  tags: string[]
}

/**
 * Compact one-line-per-recipe index for the model's cached context.
 * Format: [r:<id>] <title> | <tag>, <tag>, ...
 * Stable order (alphabetical by title) keeps the prompt cache warm.
 */
export function buildCatalogIndex(recipes: CatalogRecipe[]): string {
  if (recipes.length === 0) return ''

  const clean = (s: string) => s.replace(/[|\n\r]/g, ' ')

  return [...recipes]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((r) => `[${MEAL_GEN_RECIPE_ID_PREFIX}${r.id}] ${clean(r.title)} | ${r.tags.map(clean).join(', ')}`)
    .join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/catalog-index.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/catalog-index.ts src/lib/ai/meal-plan/catalog-index.test.ts
git commit -m "feat(meal-gen): add compact catalog index builder"
```

---

### Task 3: System prompt builder

**Files:**
- Create: `src/lib/ai/meal-plan/prompt.ts`
- Create: `src/lib/ai/meal-plan/prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/prompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildSystemPrompt, type HouseholdContext } from './prompt'

const context: HouseholdContext = {
  household: {
    members: [
      { name: 'Sean', role: 'adult' },
      { name: 'Kid1', role: 'managed', age: 7 },
    ],
    staples: ['olive oil', 'salt', 'pasta'],
    locale: 'UK',
  },
  catalogIndex: '[r:abc] Thai Green Curry | thai, curry',
}

describe('buildSystemPrompt', () => {
  it('includes the household block', () => {
    const prompt = buildSystemPrompt(context)
    expect(prompt).toContain('<household>')
    expect(prompt).toContain('Sean')
    expect(prompt).toContain('Kid1')
    expect(prompt).toContain('olive oil')
  })

  it('includes the catalog', () => {
    expect(buildSystemPrompt(context)).toContain('[r:abc] Thai Green Curry')
  })

  it('includes the planning guidelines', () => {
    const prompt = buildSystemPrompt(context)
    expect(prompt).toContain('Prefer recipes from the household catalog')
    expect(prompt).toContain('Avoid repeating the same recipe')
  })

  it('includes an empty catalog marker when catalog is empty', () => {
    const prompt = buildSystemPrompt({ ...context, catalogIndex: '' })
    expect(prompt).toContain('(no recipes yet)')
  })

  it('is stable across calls for the same input (cacheable)', () => {
    expect(buildSystemPrompt(context)).toBe(buildSystemPrompt(context))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/prompt.test.ts`
Expected: FAIL with "Cannot find module './prompt'".

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/prompt.ts`:

```typescript
export interface HouseholdMemberInfo {
  name: string
  role: 'adult' | 'managed'
  age?: number
}

export interface HouseholdContext {
  household: {
    members: HouseholdMemberInfo[]
    staples: string[]
    locale: string
  }
  catalogIndex: string
}

export function buildSystemPrompt(ctx: HouseholdContext): string {
  const memberLines = ctx.household.members
    .map((m) => {
      if (m.role === 'adult') return `${m.name} (adult)`
      return m.age != null ? `${m.name} (age ${m.age})` : `${m.name}`
    })
    .join(', ')

  const staples = ctx.household.staples.join(', ') || '(none listed)'
  const catalog = ctx.catalogIndex.trim() || '(no recipes yet)'

  return [
    'You are a household meal planner. You help plan a week of meals through conversation.',
    '',
    '<household>',
    `Members: ${memberLines}`,
    `Staples (always stocked): ${staples}`,
    `Locale: ${ctx.household.locale}`,
    '</household>',
    '',
    '<recipe_catalog>',
    catalog,
    '</recipe_catalog>',
    '',
    '<planning_guidelines>',
    '- Prefer recipes from the household catalog. Reference them by their [r:id] token.',
    '- Search the web only when the catalog is thin for the user\'s request or they explicitly ask.',
    '- When proposing recipes, consider packet-size compatibility: half a tin of X is fine if another recipe uses the rest.',
    '- Avoid repeating the same recipe in a 7-day window unless asked.',
    '- Ask clarifying questions about who is eating when, busy nights, takeaway preferences, and dietary constraints before proposing a full plan.',
    '- Propose the plan incrementally using the propose_plan tool; each call upserts draft entries.',
    '- Respect existing accepted entries in the target week — do not overwrite them unless the user asks.',
    '</planning_guidelines>',
  ].join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/prompt.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/prompt.ts src/lib/ai/meal-plan/prompt.test.ts
git commit -m "feat(meal-gen): add system prompt builder"
```

---

### Task 4: Tool schemas

Each tool has an Anthropic tool-use schema. The schemas never reach runtime logic — only the model sees them — so these are pure data.

**Files:**
- Create: `src/lib/ai/meal-plan/tool-schemas.ts`
- Create: `src/lib/ai/meal-plan/tool-schemas.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/tool-schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { TOOL_SCHEMAS, WEB_SEARCH_SERVER_TOOL } from './tool-schemas'
import type { MealGenToolName } from '@/types/meal-gen'

describe('TOOL_SCHEMAS', () => {
  const expectedNames: MealGenToolName[] = [
    'get_recipe',
    'scrape_and_save_recipe',
    'search_inventory_leftovers',
    'get_calendar_events',
    'check_packet_sizes',
    'propose_plan',
    'remove_slot',
  ]

  it('defines a schema for every custom tool name', () => {
    for (const name of expectedNames) {
      expect(TOOL_SCHEMAS.some((s) => s.name === name), `missing schema: ${name}`).toBe(true)
    }
  })

  it('every schema has name, description, and input_schema', () => {
    for (const schema of TOOL_SCHEMAS) {
      expect(schema.name).toBeTruthy()
      expect(schema.description).toBeTruthy()
      expect(schema.input_schema).toBeTruthy()
      expect(schema.input_schema.type).toBe('object')
    }
  })

  it('exposes the Anthropic server-side web_search tool config', () => {
    expect(WEB_SEARCH_SERVER_TOOL.type).toMatch(/^web_search/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tool-schemas.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/tool-schemas.ts`:

```typescript
// Custom tool schemas in Anthropic tool-use format.
// The `web_search` tool is an Anthropic server-side tool — we just pass its config through.

interface ToolSchema {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'get_recipe',
    description: 'Fetch the full details of a household recipe by id, including ingredients, instructions, prep/cook times. Use this before proposing a recipe to confirm it fits the request.',
    input_schema: {
      type: 'object',
      properties: {
        recipe_id: { type: 'string', description: 'Recipe UUID as it appears in the catalog (the part after [r: in the catalog index)' },
      },
      required: ['recipe_id'],
    },
  },
  {
    name: 'scrape_and_save_recipe',
    description: 'Scrape a recipe from a URL and save it to the household catalog. Returns the new recipe_id. Use only after the user approves a web-found recipe.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Absolute URL to the recipe page.' },
      },
      required: ['url'],
    },
  },
  {
    name: 'search_inventory_leftovers',
    description: 'List cooked-meal inventory items with remaining servings — leftovers from past cooking. Use these to plan reheats or portion-out meals.',
    input_schema: {
      type: 'object',
      properties: {
        meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'], description: 'Optional meal type filter. Omit to list all.' },
      },
    },
  },
  {
    name: 'get_calendar_events',
    description: 'Fetch calendar events in a date window so you can factor busy evenings into the plan (e.g. late pickups, parties).',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date YYYY-MM-DD inclusive.' },
        to: { type: 'string', description: 'End date YYYY-MM-DD inclusive.' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'check_packet_sizes',
    description: 'Look up typical UK supermarket pack sizes for a list of ingredient names. Use while weighing recipe choices to prefer combinations that use up packs cleanly.',
    input_schema: {
      type: 'object',
      properties: {
        ingredient_names: {
          type: 'array',
          items: { type: 'string' },
          description: 'Normalized ingredient names (lowercase, singular), e.g. ["carrot", "chicken breast"].',
        },
      },
      required: ['ingredient_names'],
    },
  },
  {
    name: 'propose_plan',
    description: 'Upsert one or more draft meal-plan entries for the target week. Call this repeatedly as the plan evolves. Drafts do not become real entries until the user accepts.',
    input_schema: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'YYYY-MM-DD' },
              meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
              source: { type: 'string', enum: ['recipe', 'custom', 'custom_with_ingredients', 'leftover'] },
              recipe_id: { type: 'string', description: 'Required when source=recipe; leave unset otherwise.' },
              inventory_item_id: { type: 'string', description: 'Required when source=leftover.' },
              custom_name: { type: 'string', description: 'Required when source=custom or custom_with_ingredients.' },
              custom_ingredients: {
                type: 'array',
                description: 'Required when source=custom_with_ingredients. Ingredients to include on the shopping list.',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    quantity: { type: ['number', 'null'] },
                    unit: { type: ['string', 'null'] },
                  },
                  required: ['name'],
                },
              },
              servings: { type: 'number', description: 'Defaults to household size if omitted.' },
              assigned_to: {
                type: 'array',
                items: { type: 'string' },
                description: 'Optional list of person ids; empty = whole household.',
              },
              notes: { type: 'string' },
            },
            required: ['date', 'meal_type', 'source'],
          },
        },
      },
      required: ['entries'],
    },
  },
  {
    name: 'remove_slot',
    description: 'Remove a draft entry for a specific date and meal_type.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
      },
      required: ['date', 'meal_type'],
    },
  },
]

// Anthropic server-side web search tool. The exact type string is what the
// SDK expects to pass through — runtime handling is on Anthropic's side.
// Check the SDK release notes if the tool type version needs bumping.
export const WEB_SEARCH_SERVER_TOOL = {
  type: 'web_search_20250305' as const,
  name: 'web_search' as const,
  max_uses: 10,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tool-schemas.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/tool-schemas.ts src/lib/ai/meal-plan/tool-schemas.test.ts
git commit -m "feat(meal-gen): add Anthropic tool schemas"
```

---

### Task 5: Tool — check_packet_sizes

**Files:**
- Create: `src/lib/ai/meal-plan/tools/check-packet-sizes.ts`
- Create: `src/lib/ai/meal-plan/tools/check-packet-sizes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/tools/check-packet-sizes.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { checkPacketSizes } from './check-packet-sizes'
import type { ToolContext } from '../types'

function fakeContext(rows: any[]) {
  const chain = {
    in: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  }
  const supabase: any = {
    from: vi.fn(() => ({ select: vi.fn(() => chain) })),
  }
  return {
    supabase,
    householdId: 'h1',
    userId: 'u1',
    conversationId: 'c1',
  } as unknown as ToolContext
}

describe('checkPacketSizes', () => {
  it('groups rows by ingredient and returns compact output', async () => {
    const ctx = fakeContext([
      { ingredient_name: 'carrot', pack_quantity: 1, pack_unit: 'kg', is_default: true },
      { ingredient_name: 'carrot', pack_quantity: 500, pack_unit: 'g', is_default: false },
      { ingredient_name: 'onion', pack_quantity: 3, pack_unit: 'ct', is_default: true },
    ])
    const result = await checkPacketSizes(ctx, { ingredient_names: ['carrot', 'onion'] })
    expect(result.content).toEqual([
      {
        name: 'carrot',
        packs: [
          { quantity: 1, unit: 'kg', is_default: true },
          { quantity: 500, unit: 'g', is_default: false },
        ],
      },
      { name: 'onion', packs: [{ quantity: 3, unit: 'ct', is_default: true }] },
    ])
  })

  it('returns empty packs list for unknown ingredients', async () => {
    const ctx = fakeContext([])
    const result = await checkPacketSizes(ctx, { ingredient_names: ['dragonfruit'] })
    expect(result.content).toEqual([{ name: 'dragonfruit', packs: [] }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/check-packet-sizes.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/tools/check-packet-sizes.ts`:

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
    .select('ingredient_name, pack_quantity, pack_unit, is_default')
    .in('ingredient_name', names)
    .order('is_default', { ascending: false })

  if (error) {
    return { content: [{ name: 'error', packs: [] }] as any, is_error: true }
  }

  const byName = new Map<string, PacketSizesOutput>()
  for (const name of names) {
    byName.set(name, { name, packs: [] })
  }
  for (const row of data ?? []) {
    const entry = byName.get(row.ingredient_name)
    if (!entry) continue
    entry.packs.push({
      quantity: Number(row.pack_quantity),
      unit: row.pack_unit,
      is_default: row.is_default,
    })
  }

  return { content: [...byName.values()] }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/check-packet-sizes.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/tools/check-packet-sizes.ts src/lib/ai/meal-plan/tools/check-packet-sizes.test.ts
git commit -m "feat(meal-gen): add check_packet_sizes tool"
```

---

### Task 6: Tool — get_recipe

**Files:**
- Create: `src/lib/ai/meal-plan/tools/get-recipe.ts`
- Create: `src/lib/ai/meal-plan/tools/get-recipe.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/tools/get-recipe.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { getRecipe } from './get-recipe'
import type { ToolContext } from '../types'

function fakeContext(recipeData: any, ingredientData: any[] = []) {
  const supabase: any = {
    from: vi.fn((table: string) => {
      if (table === 'recipes') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: recipeData, error: null })),
              })),
            })),
          })),
        }
      }
      if (table === 'recipe_ingredients') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: ingredientData, error: null })),
            })),
          })),
        }
      }
      throw new Error('unexpected table ' + table)
    }),
  }
  return { supabase, householdId: 'h1', userId: 'u1', conversationId: 'c1' } as unknown as ToolContext
}

describe('getRecipe', () => {
  it('returns the recipe with ingredients', async () => {
    const ctx = fakeContext(
      { id: 'r1', title: 'Curry', description: null, servings: 4, prep_time: 10, cook_time: 30, instructions: ['step 1'] },
      [{ raw_text: '1 onion', quantity: 1, unit: null, name: 'onion', notes: null, optional: false }],
    )
    const result = await getRecipe(ctx, { recipe_id: 'r1' })
    expect(result.is_error).toBeFalsy()
    expect(result.content).toMatchObject({
      id: 'r1',
      title: 'Curry',
      servings: 4,
      ingredients: [{ name: 'onion', quantity: 1 }],
    })
  })

  it('returns an error tool result when recipe not found', async () => {
    const ctx = fakeContext(null)
    const result = await getRecipe(ctx, { recipe_id: 'missing' })
    expect(result.is_error).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/get-recipe.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/tools/get-recipe.ts`:

```typescript
import type { ToolContext, ToolResult } from '../types'

export interface GetRecipeInput {
  recipe_id: string
}

export interface GetRecipeOutput {
  id: string
  title: string
  description: string | null
  servings: number
  prep_time: number | null
  cook_time: number | null
  instructions: unknown
  ingredients: Array<{
    raw_text: string
    quantity: number | null
    unit: string | null
    name: string | null
    notes: string | null
    optional: boolean
  }>
}

export async function getRecipe(
  ctx: ToolContext,
  input: GetRecipeInput,
): Promise<ToolResult<GetRecipeOutput | { error: string }>> {
  const { data: recipe, error: recipeError } = await ctx.supabase
    .from('recipes')
    .select('id, title, description, servings, prep_time, cook_time, instructions')
    .eq('id', input.recipe_id)
    .eq('household_id', ctx.householdId)
    .maybeSingle()

  if (recipeError || !recipe) {
    return {
      content: { error: `Recipe ${input.recipe_id} not found in this household.` },
      is_error: true,
    }
  }

  const { data: ingredients, error: ingError } = await ctx.supabase
    .from('recipe_ingredients')
    .select('raw_text, quantity, unit, name, notes, optional')
    .eq('recipe_id', input.recipe_id)
    .order('sort_order', { ascending: true })

  if (ingError) {
    return { content: { error: `Failed to load ingredients: ${ingError.message}` }, is_error: true }
  }

  return {
    content: {
      ...recipe,
      ingredients: (ingredients ?? []).map((i) => ({
        raw_text: i.raw_text ?? '',
        quantity: i.quantity,
        unit: i.unit,
        name: i.name,
        notes: i.notes,
        optional: i.optional ?? false,
      })),
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/get-recipe.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/tools/get-recipe.ts src/lib/ai/meal-plan/tools/get-recipe.test.ts
git commit -m "feat(meal-gen): add get_recipe tool"
```

---

### Task 7: Tool — search_inventory_leftovers

**Files:**
- Create: `src/lib/ai/meal-plan/tools/search-inventory-leftovers.ts`
- Create: `src/lib/ai/meal-plan/tools/search-inventory-leftovers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/tools/search-inventory-leftovers.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { searchInventoryLeftovers } from './search-inventory-leftovers'
import type { ToolContext } from '../types'

function fakeContext(rows: any[]) {
  const supabase: any = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            gt: vi.fn(() => Promise.resolve({ data: rows, error: null })),
          })),
        })),
      })),
    })),
  }
  return { supabase, householdId: 'h1', userId: 'u1', conversationId: 'c1' } as unknown as ToolContext
}

describe('searchInventoryLeftovers', () => {
  it('returns cooked-meal items with remaining servings', async () => {
    const ctx = fakeContext([
      { id: 'i1', display_name: 'Chili con carne', cooked_servings: 3, source_recipe_id: 'r1', expiry_date: '2026-05-01' },
    ])
    const result = await searchInventoryLeftovers(ctx, {})
    expect(result.content).toEqual([
      { id: 'i1', name: 'Chili con carne', servings_available: 3, source_recipe_id: 'r1', expiry_date: '2026-05-01' },
    ])
  })

  it('returns empty array when there are no leftovers (inventory unpopulated)', async () => {
    const ctx = fakeContext([])
    const result = await searchInventoryLeftovers(ctx, {})
    expect(result.content).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/search-inventory-leftovers.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/tools/search-inventory-leftovers.ts`:

```typescript
import type { ToolContext, ToolResult } from '../types'

export interface SearchInventoryLeftoversInput {
  meal_type?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
}

export interface InventoryLeftoverOutput {
  id: string
  name: string
  servings_available: number
  source_recipe_id: string | null
  expiry_date: string | null
}

export async function searchInventoryLeftovers(
  ctx: ToolContext,
  _input: SearchInventoryLeftoversInput,
): Promise<ToolResult<InventoryLeftoverOutput[]>> {
  const { data, error } = await ctx.supabase
    .from('inventory_items')
    .select('id, display_name, cooked_servings, source_recipe_id, expiry_date')
    .eq('household_id', ctx.householdId)
    .eq('is_cooked_meal', true)
    .gt('cooked_servings', 0)

  if (error) {
    return { content: [], is_error: true }
  }

  return {
    content: (data ?? []).map((row) => ({
      id: row.id,
      name: row.display_name ?? '(unnamed leftover)',
      servings_available: Number(row.cooked_servings ?? 0),
      source_recipe_id: row.source_recipe_id ?? null,
      expiry_date: row.expiry_date ?? null,
    })),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/search-inventory-leftovers.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/tools/search-inventory-leftovers.ts src/lib/ai/meal-plan/tools/search-inventory-leftovers.test.ts
git commit -m "feat(meal-gen): add search_inventory_leftovers tool"
```

---

### Task 8: Tool — get_calendar_events

**Files:**
- Create: `src/lib/ai/meal-plan/tools/get-calendar-events.ts`
- Create: `src/lib/ai/meal-plan/tools/get-calendar-events.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/tools/get-calendar-events.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { getCalendarEvents } from './get-calendar-events'
import type { ToolContext } from '../types'

function fakeContext(rows: any[]) {
  const supabase: any = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(() => ({
            lte: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
            })),
          })),
        })),
      })),
    })),
  }
  return { supabase, householdId: 'h1', userId: 'u1', conversationId: 'c1' } as unknown as ToolContext
}

describe('getCalendarEvents', () => {
  it('returns events in the window', async () => {
    const ctx = fakeContext([
      { id: 'e1', title: 'Swim club', start_datetime: '2026-04-22T17:00:00Z', end_datetime: '2026-04-22T18:30:00Z', all_day: false, category: 'appointment' },
    ])
    const result = await getCalendarEvents(ctx, { from: '2026-04-20', to: '2026-04-26' })
    expect(result.content).toHaveLength(1)
    expect(result.content[0]).toMatchObject({ id: 'e1', title: 'Swim club' })
  })

  it('rejects bad dates', async () => {
    const ctx = fakeContext([])
    const result = await getCalendarEvents(ctx, { from: 'not-a-date', to: '2026-04-26' })
    expect(result.is_error).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/get-calendar-events.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/tools/get-calendar-events.ts`:

```typescript
import type { ToolContext, ToolResult } from '../types'

export interface GetCalendarEventsInput {
  from: string
  to: string
}

export interface CalendarEventOutput {
  id: string
  title: string
  start_datetime: string
  end_datetime: string | null
  all_day: boolean
  category: string | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function getCalendarEvents(
  ctx: ToolContext,
  input: GetCalendarEventsInput,
): Promise<ToolResult<CalendarEventOutput[] | { error: string }>> {
  if (!DATE_RE.test(input.from) || !DATE_RE.test(input.to)) {
    return { content: { error: 'from and to must be YYYY-MM-DD' }, is_error: true }
  }

  const { data, error } = await ctx.supabase
    .from('calendar_events')
    .select('id, title, start_datetime, end_datetime, all_day, category')
    .eq('household_id', ctx.householdId)
    .gte('start_datetime', `${input.from}T00:00:00Z`)
    .lte('start_datetime', `${input.to}T23:59:59Z`)
    .order('start_datetime', { ascending: true })

  if (error) {
    return { content: { error: error.message }, is_error: true }
  }

  return {
    content: (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      start_datetime: row.start_datetime,
      end_datetime: row.end_datetime,
      all_day: row.all_day,
      category: row.category,
    })),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/get-calendar-events.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/tools/get-calendar-events.ts src/lib/ai/meal-plan/tools/get-calendar-events.test.ts
git commit -m "feat(meal-gen): add get_calendar_events tool"
```

---

### Task 9: Tool — propose_plan

**Files:**
- Create: `src/lib/ai/meal-plan/tools/propose-plan.ts`
- Create: `src/lib/ai/meal-plan/tools/propose-plan.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/tools/propose-plan.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { proposePlan } from './propose-plan'
import type { ToolContext } from '../types'

function fakeContext(upsertResult: { data: any; error: any }) {
  const upsert = vi.fn(() => ({
    select: vi.fn(() => Promise.resolve(upsertResult)),
  }))
  const supabase: any = {
    from: vi.fn(() => ({ upsert })),
  }
  return {
    ctx: { supabase, householdId: 'h1', userId: 'u1', conversationId: 'c1' } as unknown as ToolContext,
    upsert,
  }
}

describe('proposePlan', () => {
  it('upserts entries with source=recipe, writes recipe_id only', async () => {
    const { ctx, upsert } = fakeContext({
      data: [{ id: 'd1', date: '2026-04-22', meal_type: 'dinner' }],
      error: null,
    })
    const result = await proposePlan(ctx, {
      entries: [
        { date: '2026-04-22', meal_type: 'dinner', source: 'recipe', recipe_id: 'r1', servings: 4 },
      ],
    })
    expect(result.is_error).toBeFalsy()
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          conversation_id: 'c1',
          date: '2026-04-22',
          meal_type: 'dinner',
          source: 'recipe',
          recipe_id: 'r1',
          inventory_item_id: null,
          custom_name: null,
          custom_ingredients: null,
          servings: 4,
        }),
      ],
      expect.objectContaining({ onConflict: 'conversation_id,date,meal_type' }),
    )
  })

  it('rejects recipe source without recipe_id', async () => {
    const { ctx } = fakeContext({ data: null, error: null })
    const result = await proposePlan(ctx, {
      entries: [{ date: '2026-04-22', meal_type: 'dinner', source: 'recipe' }],
    })
    expect(result.is_error).toBe(true)
  })

  it('rejects custom_with_ingredients source without both custom_name and custom_ingredients', async () => {
    const { ctx } = fakeContext({ data: null, error: null })
    const result = await proposePlan(ctx, {
      entries: [{ date: '2026-04-22', meal_type: 'dinner', source: 'custom_with_ingredients', custom_name: 'DIY tacos' }],
    })
    expect(result.is_error).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/propose-plan.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/tools/propose-plan.ts`:

```typescript
import type { ToolContext, ToolResult, ProposedEntry } from '../types'

export interface ProposePlanInput {
  entries: ProposedEntry[]
}

export interface ProposePlanOutput {
  draft_ids: string[]
}

function validate(entry: ProposedEntry): string | null {
  switch (entry.source) {
    case 'recipe':
      if (!entry.recipe_id) return 'source=recipe requires recipe_id'
      return null
    case 'leftover':
      if (!entry.inventory_item_id) return 'source=leftover requires inventory_item_id'
      return null
    case 'custom':
      if (!entry.custom_name) return 'source=custom requires custom_name'
      return null
    case 'custom_with_ingredients':
      if (!entry.custom_name || !entry.custom_ingredients || entry.custom_ingredients.length === 0) {
        return 'source=custom_with_ingredients requires custom_name and custom_ingredients'
      }
      return null
  }
}

export async function proposePlan(
  ctx: ToolContext,
  input: ProposePlanInput,
): Promise<ToolResult<ProposePlanOutput | { error: string }>> {
  for (const entry of input.entries) {
    const err = validate(entry)
    if (err) return { content: { error: err }, is_error: true }
  }

  const rows = input.entries.map((e) => ({
    conversation_id: ctx.conversationId,
    date: e.date,
    meal_type: e.meal_type,
    source: e.source,
    recipe_id: e.source === 'recipe' ? e.recipe_id! : null,
    inventory_item_id: e.source === 'leftover' ? e.inventory_item_id! : null,
    custom_name: (e.source === 'custom' || e.source === 'custom_with_ingredients') ? e.custom_name! : null,
    custom_ingredients: e.source === 'custom_with_ingredients' ? (e.custom_ingredients as unknown) : null,
    servings: e.servings ?? 1,
    assigned_to: e.assigned_to ?? [],
    notes: e.notes ?? null,
  }))

  const { data, error } = await ctx.supabase
    .from('meal_gen_drafts')
    .upsert(rows, { onConflict: 'conversation_id,date,meal_type' })
    .select('id')

  if (error) {
    return { content: { error: error.message }, is_error: true }
  }

  return { content: { draft_ids: (data ?? []).map((r) => r.id) } }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/propose-plan.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/tools/propose-plan.ts src/lib/ai/meal-plan/tools/propose-plan.test.ts
git commit -m "feat(meal-gen): add propose_plan tool"
```

---

### Task 10: Tool — remove_slot

**Files:**
- Create: `src/lib/ai/meal-plan/tools/remove-slot.ts`
- Create: `src/lib/ai/meal-plan/tools/remove-slot.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/tools/remove-slot.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { removeSlot } from './remove-slot'
import type { ToolContext } from '../types'

function fakeContext() {
  const third = vi.fn(() => Promise.resolve({ error: null }))
  const second = vi.fn(() => ({ eq: third }))
  const first = vi.fn(() => ({ eq: second }))
  const del = vi.fn(() => ({ eq: first }))
  const supabase: any = { from: vi.fn(() => ({ delete: del })) }
  return {
    ctx: { supabase, householdId: 'h1', userId: 'u1', conversationId: 'c1' } as unknown as ToolContext,
    first,
    second,
    third,
  }
}

describe('removeSlot', () => {
  it('deletes the draft slot scoped to the conversation', async () => {
    const { ctx, first, second, third } = fakeContext()
    await removeSlot(ctx, { date: '2026-04-22', meal_type: 'dinner' })
    expect(first).toHaveBeenCalledWith('conversation_id', 'c1')
    expect(second).toHaveBeenCalledWith('date', '2026-04-22')
    expect(third).toHaveBeenCalledWith('meal_type', 'dinner')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/remove-slot.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/tools/remove-slot.ts`:

```typescript
import type { ToolContext, ToolResult } from '../types'

export interface RemoveSlotInput {
  date: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
}

export async function removeSlot(
  ctx: ToolContext,
  input: RemoveSlotInput,
): Promise<ToolResult<{ ok: true } | { error: string }>> {
  const { error } = await ctx.supabase
    .from('meal_gen_drafts')
    .delete()
    .eq('conversation_id', ctx.conversationId)
    .eq('date', input.date)
    .eq('meal_type', input.meal_type)

  if (error) {
    return { content: { error: error.message }, is_error: true }
  }
  return { content: { ok: true } }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/remove-slot.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/tools/remove-slot.ts src/lib/ai/meal-plan/tools/remove-slot.test.ts
git commit -m "feat(meal-gen): add remove_slot tool"
```

---

### Task 11: Extract recipe from URL

A small new module next to `extract-recipe.ts`. Fetches HTML, strips to plain text, sends to Claude for structured extraction. Used by the scrape-and-save tool.

**Files:**
- Create: `src/lib/ai/extract-recipe-from-url.ts`
- Create: `src/lib/ai/extract-recipe-from-url.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/extract-recipe-from-url.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

import { extractRecipeFromUrl, stripHtml } from './extract-recipe-from-url'

describe('stripHtml', () => {
  it('removes scripts, styles, and preserves body text', () => {
    const html = '<html><head><style>x{}</style><script>var a=1</script></head><body><p>Hello <b>World</b></p></body></html>'
    const text = stripHtml(html)
    expect(text).toContain('Hello')
    expect(text).toContain('World')
    expect(text).not.toContain('x{}')
    expect(text).not.toContain('var a=1')
  })

  it('collapses runs of whitespace', () => {
    expect(stripHtml('<p>a     b\n\n\nc</p>')).toBe('a b c')
  })
})

describe('extractRecipeFromUrl', () => {
  beforeEach(() => {
    mockCreate.mockReset()
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve('<html><body><h1>Lemon Salmon</h1><p>Ingredients: 2 salmon fillets</p></body></html>'),
      }),
    ) as unknown as typeof fetch
  })

  it('fetches the url, passes cleaned text to Claude, and returns parsed JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ title: 'Lemon Salmon', ingredients: [{ raw_text: '2 salmon fillets', name: 'salmon fillet', quantity: 2, unit: null, notes: null }], instructions: ['Bake it'], servings: 2 }) }],
    })
    const result = await extractRecipeFromUrl('https://example.com/recipe')
    expect(result.title).toBe('Lemon Salmon')
    expect(mockCreate).toHaveBeenCalledOnce()
    const call = mockCreate.mock.calls[0][0]
    expect(call.messages[0].content[0].text).toContain('Lemon Salmon')
  })

  it('throws on non-2xx fetch', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve('') })) as unknown as typeof fetch
    await expect(extractRecipeFromUrl('https://example.com/missing')).rejects.toThrow(/404/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/extract-recipe-from-url.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/ai/extract-recipe-from-url.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { validateExtractionResult, type ExtractionResult } from './extract-recipe'

const MODEL = 'claude-sonnet-4-20250514'
const MAX_HTML_CHARS = 200_000

export function stripHtml(html: string): string {
  let text = html
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

const URL_EXTRACTION_PROMPT = `You are a recipe extraction assistant. The text below was scraped from a recipe web page. Extract structured data.

Return ONLY valid JSON in the same shape as the image-extraction pipeline uses:
{
  "title": "...",
  "description": "...",
  "servings": 4,
  "prep_time": 15,
  "cook_time": 30,
  "ingredients": [{ "raw_text": "...", "quantity": 2, "unit": "g", "name": "onion", "notes": null }],
  "instructions": ["..."],
  "tags": ["..."],
  "source_author": null,
  "source_book": null,
  "hero_image": null
}

Rules:
- Singular, lowercase, adjective-stripped names ("onion" not "red onions").
- quantity is numeric; null when unspecified. Use decimals for fractions.
- unit uses short abbreviations (g, kg, ml, l, tsp, tbsp, cup); null when none.
- instructions are one string per step, in order.
- tags: lowercase, one-word where possible.
- hero_image must be null (no image context available from URL scrape).`

export async function extractRecipeFromUrl(url: string, apiKey?: string): Promise<ExtractionResult> {
  const response = await fetch(url, { headers: { 'User-Agent': 'LemonsBot/1.0' } })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`)
  }
  const html = await response.text()
  const text = stripHtml(html).slice(0, MAX_HTML_CHARS)

  const client = new Anthropic(apiKey ? { apiKey } : undefined)
  const completion = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: `${URL_EXTRACTION_PROMPT}\n\n---\nSOURCE URL: ${url}\n\nPAGE TEXT:\n${text}` },
        ],
      },
    ],
  })

  const block = completion.content.find((c) => c.type === 'text')
  if (!block || block.type !== 'text') {
    throw new Error('No text response from Claude')
  }
  let jsonStr = block.text
  const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) jsonStr = match[1]
  const parsed = JSON.parse(jsonStr.trim())
  return validateExtractionResult(parsed)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/extract-recipe-from-url.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/extract-recipe-from-url.ts src/lib/ai/extract-recipe-from-url.test.ts
git commit -m "feat(ai): add URL-based recipe extraction"
```

---

### Task 12: Tool — scrape_and_save_recipe

Thin wrapper: take a URL, check for existing recipe, otherwise extract via Task 11 and insert.

**Files:**
- Create: `src/lib/ai/meal-plan/tools/scrape-and-save-recipe.ts`
- Create: `src/lib/ai/meal-plan/tools/scrape-and-save-recipe.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/tools/scrape-and-save-recipe.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExtract = vi.fn()
vi.mock('@/lib/ai/extract-recipe-from-url', () => ({
  extractRecipeFromUrl: mockExtract,
}))

import { scrapeAndSaveRecipe } from './scrape-and-save-recipe'
import type { ToolContext } from '../types'

function fakeContext(options: {
  existing?: { id: string } | null
  insertedRecipe?: { id: string }
  insertError?: any
}) {
  const recipesMaybeSingle = vi.fn(() => Promise.resolve({ data: options.existing ?? null, error: null }))
  const recipesInsertSingle = vi.fn(() =>
    Promise.resolve({ data: options.insertedRecipe, error: options.insertError ?? null }),
  )
  const ingInsert = vi.fn(() => Promise.resolve({ data: null, error: null }))

  const supabase: any = {
    from: vi.fn((table: string) => {
      if (table === 'recipes') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: recipesMaybeSingle,
              })),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({ single: recipesInsertSingle })),
          })),
        }
      }
      if (table === 'recipe_ingredients') {
        return { insert: ingInsert }
      }
      throw new Error('unexpected ' + table)
    }),
  }
  return {
    ctx: { supabase, householdId: 'h1', userId: 'u1', conversationId: 'c1' } as unknown as ToolContext,
    ingInsert,
    recipesInsertSingle,
  }
}

describe('scrapeAndSaveRecipe', () => {
  beforeEach(() => {
    mockExtract.mockReset()
  })

  it('returns existing recipe_id for a duplicate source_url without re-scraping', async () => {
    const { ctx } = fakeContext({ existing: { id: 'existing-r1' } })
    const result = await scrapeAndSaveRecipe(ctx, { url: 'https://example.com/r' })
    expect(result.content).toMatchObject({ recipe_id: 'existing-r1', reused: true })
    expect(mockExtract).not.toHaveBeenCalled()
  })

  it('scrapes, inserts recipe and ingredients, returns new id', async () => {
    mockExtract.mockResolvedValue({
      title: 'Lemon Salmon',
      description: null,
      servings: 2,
      prep_time: 10,
      cook_time: 20,
      instructions: ['Bake'],
      ingredients: [{ raw_text: '2 salmon fillets', quantity: 2, unit: null, name: 'salmon fillet', notes: null }],
      tags: [],
      source_author: null,
      source_book: null,
      hero_image: null,
    })
    const { ctx, ingInsert, recipesInsertSingle } = fakeContext({ insertedRecipe: { id: 'new-r2' } })
    const result = await scrapeAndSaveRecipe(ctx, { url: 'https://example.com/r' })
    expect(result.content).toMatchObject({ recipe_id: 'new-r2', reused: false })
    expect(recipesInsertSingle).toHaveBeenCalledOnce()
    expect(ingInsert).toHaveBeenCalledOnce()
  })

  it('returns error on scrape failure', async () => {
    mockExtract.mockRejectedValue(new Error('Failed to fetch https://...: 404'))
    const { ctx } = fakeContext({})
    const result = await scrapeAndSaveRecipe(ctx, { url: 'https://example.com/missing' })
    expect(result.is_error).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/scrape-and-save-recipe.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/tools/scrape-and-save-recipe.ts`:

```typescript
import type { ToolContext, ToolResult } from '../types'
import { extractRecipeFromUrl } from '@/lib/ai/extract-recipe-from-url'

export interface ScrapeAndSaveRecipeInput {
  url: string
}

export interface ScrapeAndSaveRecipeOutput {
  recipe_id: string
  title: string
  reused: boolean
}

async function getHouseholdApiKey(
  supabase: ToolContext['supabase'],
  householdId: string,
): Promise<string | undefined> {
  const { data } = await supabase
    .from('households')
    .select('anthropic_api_key')
    .eq('id', householdId)
    .maybeSingle()
  return data?.anthropic_api_key ?? undefined
}

export async function scrapeAndSaveRecipe(
  ctx: ToolContext,
  input: ScrapeAndSaveRecipeInput,
): Promise<ToolResult<ScrapeAndSaveRecipeOutput | { error: string }>> {
  const { data: existing } = await ctx.supabase
    .from('recipes')
    .select('id, title')
    .eq('source_url', input.url)
    .eq('household_id', ctx.householdId)
    .maybeSingle()

  if (existing) {
    return { content: { recipe_id: existing.id, title: existing.title, reused: true } }
  }

  let extraction
  try {
    const apiKey = await getHouseholdApiKey(ctx.supabase, ctx.householdId)
    extraction = await extractRecipeFromUrl(input.url, apiKey)
  } catch (err: any) {
    return { content: { error: `Scrape failed: ${err?.message ?? String(err)}` }, is_error: true }
  }

  const { data: inserted, error: insertError } = await ctx.supabase
    .from('recipes')
    .insert({
      title: extraction.title,
      description: extraction.description,
      servings: extraction.servings,
      prep_time: extraction.prep_time,
      cook_time: extraction.cook_time,
      instructions: extraction.instructions,
      source_url: input.url,
      source_author: extraction.source_author,
      source_book: extraction.source_book,
      household_id: ctx.householdId,
      created_by: ctx.userId,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    return { content: { error: `Failed to save recipe: ${insertError?.message ?? 'unknown'}` }, is_error: true }
  }

  const ingredientRows = extraction.ingredients.map((ing, i) => ({
    recipe_id: inserted.id,
    raw_text: ing.raw_text,
    quantity: ing.quantity,
    unit: ing.unit,
    name: ing.name,
    notes: ing.notes,
    sort_order: i,
  }))
  if (ingredientRows.length > 0) {
    await ctx.supabase.from('recipe_ingredients').insert(ingredientRows)
  }

  return { content: { recipe_id: inserted.id, title: extraction.title, reused: false } }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/scrape-and-save-recipe.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/tools/scrape-and-save-recipe.ts src/lib/ai/meal-plan/tools/scrape-and-save-recipe.test.ts
git commit -m "feat(meal-gen): add scrape_and_save_recipe tool"
```

---

### Task 13: Tool registry

Central dispatcher that routes an Anthropic tool_use call to the right implementation.

**Files:**
- Create: `src/lib/ai/meal-plan/tools/index.ts`
- Create: `src/lib/ai/meal-plan/tools/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/tools/index.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { dispatchTool, TOOL_REGISTRY } from './index'
import type { ToolContext } from '../types'

describe('TOOL_REGISTRY', () => {
  it('contains all 7 custom tools', () => {
    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([
      'check_packet_sizes',
      'get_calendar_events',
      'get_recipe',
      'propose_plan',
      'remove_slot',
      'scrape_and_save_recipe',
      'search_inventory_leftovers',
    ])
  })
})

describe('dispatchTool', () => {
  it('routes to the named tool', async () => {
    const ctx: ToolContext = { supabase: {} as any, householdId: 'h1', userId: 'u1', conversationId: 'c1' }
    const fake = vi.fn(() => Promise.resolve({ content: { ok: true } }))
    const result = await dispatchTool('propose_plan', ctx, { entries: [] }, { propose_plan: fake } as any)
    expect(fake).toHaveBeenCalledWith(ctx, { entries: [] })
    expect(result.content).toEqual({ ok: true })
  })

  it('returns an error result for unknown tool name', async () => {
    const ctx: ToolContext = { supabase: {} as any, householdId: 'h1', userId: 'u1', conversationId: 'c1' }
    const result = await dispatchTool('not_a_tool' as any, ctx, {})
    expect(result.is_error).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/index.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/tools/index.ts`:

```typescript
import type { MealGenToolName } from '@/types/meal-gen'
import type { ToolContext, ToolResult } from '../types'
import { checkPacketSizes } from './check-packet-sizes'
import { getRecipe } from './get-recipe'
import { searchInventoryLeftovers } from './search-inventory-leftovers'
import { getCalendarEvents } from './get-calendar-events'
import { proposePlan } from './propose-plan'
import { removeSlot } from './remove-slot'
import { scrapeAndSaveRecipe } from './scrape-and-save-recipe'

export type ToolImpl = (ctx: ToolContext, input: any) => Promise<ToolResult>

export const TOOL_REGISTRY: Record<Exclude<MealGenToolName, 'search_web'>, ToolImpl> = {
  check_packet_sizes: checkPacketSizes as ToolImpl,
  get_recipe: getRecipe as ToolImpl,
  search_inventory_leftovers: searchInventoryLeftovers as ToolImpl,
  get_calendar_events: getCalendarEvents as ToolImpl,
  propose_plan: proposePlan as ToolImpl,
  remove_slot: removeSlot as ToolImpl,
  scrape_and_save_recipe: scrapeAndSaveRecipe as ToolImpl,
}

export async function dispatchTool(
  name: MealGenToolName,
  ctx: ToolContext,
  input: unknown,
  registry: Record<string, ToolImpl> = TOOL_REGISTRY,
): Promise<ToolResult> {
  if (name === 'search_web') {
    return {
      content: { error: 'search_web is handled server-side by Anthropic; should not reach dispatchTool' },
      is_error: true,
    }
  }
  const impl = registry[name]
  if (!impl) {
    return { content: { error: `Unknown tool: ${name}` }, is_error: true }
  }
  return impl(ctx, input as any)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/tools/index.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/tools/index.ts src/lib/ai/meal-plan/tools/index.test.ts
git commit -m "feat(meal-gen): add tool registry and dispatcher"
```

---

### Task 14: Conversation orchestrator

Run a single user turn: prepare messages, call Anthropic with cached system + tools, handle tool_use blocks by dispatching and feeding results back until the model returns a natural `end_turn`.

**Files:**
- Create: `src/lib/ai/meal-plan/conversation.ts`
- Create: `src/lib/ai/meal-plan/conversation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/conversation.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { runTurn, type AnthropicLike } from './conversation'
import type { ToolContext } from './types'
import type { MealGenMessage } from '@/types/meal-gen'

function fakeClient(responses: any[]): AnthropicLike {
  let i = 0
  return {
    messages: {
      create: vi.fn(() => Promise.resolve(responses[i++] ?? { stop_reason: 'end_turn', content: [] })),
    },
  }
}

const ctx: ToolContext = { supabase: {} as any, householdId: 'h1', userId: 'u1', conversationId: 'c1' }

const baseState = {
  systemPrompt: 'system',
  prior: [] as MealGenMessage[],
  apiKey: 'test-key',
}

describe('runTurn', () => {
  it('returns end_turn when the model replies without tool calls', async () => {
    const client = fakeClient([
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Hello!' }],
        usage: { input_tokens: 100, output_tokens: 5 },
      },
    ])
    const result = await runTurn(
      { ...baseState },
      'Plan my week',
      ctx,
      { client, dispatch: vi.fn() },
    )
    expect(result.stoppedReason).toBe('end_turn')
    expect(result.assistantMessages[0].content).toContain('Hello!')
    expect(result.toolCallsMade).toBe(0)
  })

  it('executes a tool call and feeds the result back until end_turn', async () => {
    const dispatch = vi.fn(() => Promise.resolve({ content: { ok: true } }))
    const client = fakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Let me check packets.' },
          { type: 'tool_use', id: 'tu1', name: 'check_packet_sizes', input: { ingredient_names: ['onion'] } },
        ],
        usage: { input_tokens: 120, output_tokens: 10 },
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Done.' }],
        usage: { input_tokens: 140, output_tokens: 5 },
      },
    ])
    const result = await runTurn({ ...baseState }, 'Plan my week', ctx, { client, dispatch })
    expect(dispatch).toHaveBeenCalledWith('check_packet_sizes', ctx, { ingredient_names: ['onion'] })
    expect(result.toolCallsMade).toBe(1)
    expect(result.stoppedReason).toBe('end_turn')
  })

  it('halts at MEAL_GEN_MAX_TOOL_TURNS to prevent infinite loops', async () => {
    const dispatch = vi.fn(() => Promise.resolve({ content: {} }))
    const toolResponse = {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't', name: 'check_packet_sizes', input: {} }],
      usage: { input_tokens: 10, output_tokens: 1 },
    }
    const client = fakeClient(Array(100).fill(toolResponse))
    const result = await runTurn({ ...baseState }, 'looping', ctx, { client, dispatch })
    expect(result.stoppedReason).toBe('tool_cap')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/conversation.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/conversation.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { MealGenMessage, MealGenToolName } from '@/types/meal-gen'
import type { ToolContext, TurnResult } from './types'
import { MEAL_GEN_MODEL, MEAL_GEN_MAX_TOKENS, MEAL_GEN_MAX_TOOL_TURNS } from './config'
import { TOOL_SCHEMAS, WEB_SEARCH_SERVER_TOOL } from './tool-schemas'
import { dispatchTool } from './tools'

// Minimal interface the orchestrator needs from the SDK — lets us inject fakes in tests.
export interface AnthropicLike {
  messages: {
    create: (params: any) => Promise<any>
  }
}

export interface RunTurnState {
  systemPrompt: string
  prior: MealGenMessage[]
  apiKey?: string
}

export interface RunTurnDeps {
  client?: AnthropicLike
  dispatch?: typeof dispatchTool
}

function now(): string {
  return new Date().toISOString()
}

export async function runTurn(
  state: RunTurnState,
  userMessage: string,
  ctx: ToolContext,
  deps: RunTurnDeps = {},
): Promise<TurnResult> {
  const client: AnthropicLike = deps.client ?? (new Anthropic(state.apiKey ? { apiKey: state.apiKey } : undefined) as unknown as AnthropicLike)
  const dispatch = deps.dispatch ?? dispatchTool

  const messages: any[] = [
    ...state.prior.map(envelopeToSdk),
    { role: 'user', content: userMessage },
  ]

  const assistantMessages: MealGenMessage[] = []
  let tokensIn = 0
  let tokensOut = 0
  let toolCallsMade = 0
  let stoppedReason: TurnResult['stoppedReason'] = 'end_turn'

  for (let turn = 0; turn < MEAL_GEN_MAX_TOOL_TURNS; turn++) {
    const response = await client.messages.create({
      model: MEAL_GEN_MODEL,
      max_tokens: MEAL_GEN_MAX_TOKENS,
      system: [{ type: 'text', text: state.systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools: [...TOOL_SCHEMAS, WEB_SEARCH_SERVER_TOOL as any],
      messages,
    })

    tokensIn += response.usage?.input_tokens ?? 0
    tokensOut += response.usage?.output_tokens ?? 0

    // Capture the assistant's message for history.
    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
    const toolUses = response.content.filter((b: any) => b.type === 'tool_use')

    assistantMessages.push({
      role: 'assistant',
      content: text,
      tool_calls: toolUses.map((tu: any) => ({ id: tu.id, name: tu.name, input: tu.input })),
      ts: now(),
    })

    // Record the model's raw turn in messages so the next iteration has full context.
    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason === 'tool_use' && toolUses.length > 0) {
      const toolResults: any[] = []
      for (const tu of toolUses) {
        const result = await dispatch(tu.name as MealGenToolName, ctx, tu.input)
        toolCallsMade += 1
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result.content),
          is_error: result.is_error ?? false,
        })
      }
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    if (response.stop_reason === 'max_tokens') {
      stoppedReason = 'max_tokens'
      break
    }
    stoppedReason = 'end_turn'
    break
  }

  if (stoppedReason === 'end_turn' && toolCallsMade > 0) {
    // Confirmed finished via end_turn even after tool loops — that's the normal exit.
  }
  // If we exited the for-loop without break, we hit the tool cap.
  if (stoppedReason === 'end_turn' && assistantMessages.length > 0 &&
      assistantMessages[assistantMessages.length - 1].tool_calls?.length) {
    stoppedReason = 'tool_cap'
  }

  return { assistantMessages, stoppedReason, toolCallsMade, tokensIn, tokensOut }
}

// Convert our stored envelope back to the SDK message format when replaying history.
function envelopeToSdk(msg: MealGenMessage): any {
  if (msg.role === 'user' || msg.role === 'system') {
    return { role: msg.role === 'system' ? 'user' : 'user', content: msg.content }
  }
  if (msg.role === 'assistant') {
    const content: any[] = []
    if (msg.content) content.push({ type: 'text', text: msg.content })
    for (const tc of msg.tool_calls ?? []) {
      content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
    }
    return { role: 'assistant', content }
  }
  if (msg.role === 'tool') {
    const content = (msg.tool_results ?? []).map((tr) => ({
      type: 'tool_result',
      tool_use_id: tr.tool_call_id,
      content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
      is_error: tr.is_error ?? false,
    }))
    return { role: 'user', content }
  }
  return { role: 'user', content: msg.content }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/conversation.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/conversation.ts src/lib/ai/meal-plan/conversation.test.ts
git commit -m "feat(meal-gen): add conversation turn orchestrator"
```

---

### Task 15: Final verification

- [ ] **Step 1: Run full test suite**

Run: `doppler run -- npm run test:run`
Expected: all tests pass (71 existing + ~30 new = ~100+ passing).

- [ ] **Step 2: Run TypeScript build**

Run: `doppler run -- npm run build`
Expected: build succeeds with no TS errors.

- [ ] **Step 3: Lint check on touched files**

Run: `doppler run -- npm run lint 2>&1 | grep -E "src/lib/ai/meal-plan|src/lib/ai/extract-recipe-from-url|src/types/meal-gen"`
Expected: no error-level output from these files specifically. (Pre-existing errors elsewhere are out of scope.)

- [ ] **Step 4: Check module structure sanity**

Run: `ls src/lib/ai/meal-plan/ src/lib/ai/meal-plan/tools/`
Expected: the files listed in "File Structure" above, all present.

- [ ] **Step 5: Git log sanity check**

Run: `git log --oneline -20`
Expected: 14 new commits from tasks 1–14 on the chunk-2a branch, plus the initial plan-commit.

No commit for this verification task — it's a gate, not a change.

---

## Post-Chunk-2a Notes

- Nothing user-visible yet. The library sits dormant until chunk 2b wires the HTTP surface.
- Conversation state (`RunTurnState`) is passed in, not persisted here — chunk 2b owns the `meal_gen_conversations` row lifecycle and calls `runTurn` per message.
- The `WEB_SEARCH_SERVER_TOOL.max_uses: 10` enforces the spec's web-search cap; no additional tracking needed in code.
- If the Anthropic SDK's `web_search` tool type string changes in a future release, update `tool-schemas.ts`. The `web_search_20250305` marker is pinned but subject to Anthropic's own versioning.

## Flag for Chunk 2b

- HTTP route handlers need to build `ToolContext` from the authenticated session + load the conversation row + pass it to `runTurn`.
- Persistence: after each `runTurn`, append `assistantMessages` to `meal_gen_conversations.messages` jsonb, bump `last_activity_at`, and update `metadata` with accumulated token counts.
- Streaming: chunk 2b can either stream token-by-token via the Anthropic streaming API (prefer) or fall back to non-streaming `messages.create` (what this plan uses). If switching to streaming, refactor `runTurn` to yield events rather than returning a single `TurnResult`.
- `scrape_and_save_recipe` currently does not attempt to load recipe tags — if tag propagation from scraped recipes is desired, extend in chunk 2b or later.
