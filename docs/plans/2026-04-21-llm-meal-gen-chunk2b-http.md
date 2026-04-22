# LLM Meal Generation — Chunk 2b: HTTP Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the HTTP surface for LLM-assisted meal plan generation — 8 API routes + helpers that wire the chunk 2a library into authenticated, persisted, cost-capped request flows. Feature gated behind `MEAL_GEN_ENABLED`.

**Architecture:** Next.js App Router route handlers under `src/app/api/meal-plans/generate/`. Each route is a thin controller: auth, flag check, load conversation, delegate to a library helper, respond with JSON. Non-streaming for v1 (single `messages.create` call per turn, under Vercel's 300s timeout). Shopping-list generation on accept is deferred to chunk 4 — accept in 2b just promotes drafts into `meal_plan_entries`.

**Tech Stack:** Next.js 16 App Router, Supabase SSR server client, Anthropic SDK (via chunk 2a's `runTurn`), Vitest.

**Spec:** `docs/plans/2026-04-20-llm-meal-generation-design.md`
**Chunk 2a (merged):** `docs/plans/2026-04-21-llm-meal-gen-chunk2a-library.md`

---

## Scope

### In This Chunk

- `MEAL_GEN_ENABLED` env flag guards every route.
- Context builder: loads household members/staples/catalog and builds `RunTurnState` + `ToolContext`.
- Cost caps: per-conversation (50 messages, 20 tool calls) + per-household daily (20 active conversations).
- 8 route handlers (create, resume, drafts, message, edit-draft, accept, discard, recent).
- Accept flow: transactionally promotes `meal_gen_drafts` → `meal_plan_entries`.
- One integration test exercising the happy-path lifecycle.

### Deferred

- **Streaming** — chunk 3 if UX requires it.
- **Shopping list generation on accept** — chunk 4 (needs packet rounding).
- **Existing-entry conflict resolution on accept** — chunk 4 (UI-driven confirmation).
- **`/api/packet-sizes` CRUD** — chunk 4.
- **Abandoned-conversation cleanup cron** — standalone ops PR anytime.
- **Token cost dashboard / analytics** — observability concern, not in this scope.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/lib/ai/meal-plan/gate.ts` | `assertMealGenEnabled()` helper — throws a typed error if the flag is off |
| `src/lib/ai/meal-plan/context.ts` | `loadConversationContext(supabase, conversationId)` — returns `{ conversation, household, catalogRecipes }` for building `RunTurnState` |
| `src/lib/ai/meal-plan/limits.ts` | Cost-cap utilities (conversation message/tool-call caps + household daily cap) |
| `src/lib/ai/meal-plan/persist.ts` | `appendMessages(supabase, conversationId, messages, tokensIn, tokensOut)` — updates `meal_gen_conversations.messages` jsonb, bumps `last_activity_at`, accumulates token totals in `metadata` |
| `src/lib/ai/meal-plan/accept.ts` | `acceptConversation(supabase, conversationId, userId)` — promotes drafts to entries, flips status |
| `src/app/api/meal-plans/generate/route.ts` | POST — create conversation |
| `src/app/api/meal-plans/generate/[id]/route.ts` | GET — resume (full messages + drafts) |
| `src/app/api/meal-plans/generate/[id]/message/route.ts` | POST — run a turn |
| `src/app/api/meal-plans/generate/[id]/drafts/route.ts` | GET — current drafts only |
| `src/app/api/meal-plans/generate/[id]/draft/route.ts` | PATCH — user edit of a draft slot from grid |
| `src/app/api/meal-plans/generate/[id]/accept/route.ts` | POST — promote drafts, close conversation |
| `src/app/api/meal-plans/generate/[id]/discard/route.ts` | POST — mark abandoned |
| `src/app/api/meal-plans/generate/recent/route.ts` | GET — list resumable conversations |
| Companion `*.test.ts` | Unit tests for each helper + one end-to-end lifecycle test |

### Modified Files

| File | Changes |
|------|---------|
| `src/lib/ai/meal-plan/config.ts` | Add `MEAL_GEN_MAX_MESSAGES_PER_CONVERSATION = 50`, `MEAL_GEN_MAX_TOOL_CALLS_PER_CONVERSATION = 20`, `MEAL_GEN_MAX_DAILY_CONVERSATIONS = 20` |

---

## Conventions Already in This Repo

- Every API route starts with: `const supabase = await createClient(); const { data: { user }, error: authError } = await supabase.auth.getUser(); if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })`. Use this verbatim.
- Return `NextResponse.json(data)` for success, `NextResponse.json({ error: msg }, { status: N })` for errors.
- Supabase server client respects RLS via session cookies — no service-role key used in routes.
- Household Anthropic API key lives at `households.anthropic_api_key` (loaded inline per route, same as `src/app/api/recipes/extract/route.ts`).
- All `MealGenMessage` writes go through the envelope defined in `src/types/meal-gen.ts`.

---

## Tasks

### Task 1: Extend config with cost-cap constants

**Files:**
- Modify: `src/lib/ai/meal-plan/config.ts`

- [ ] **Step 1: Append new constants**

Edit `src/lib/ai/meal-plan/config.ts`. After the existing `MEAL_GEN_RECIPE_ID_PREFIX` line, append:

```typescript
export const MEAL_GEN_MAX_MESSAGES_PER_CONVERSATION = 50
export const MEAL_GEN_MAX_TOOL_CALLS_PER_CONVERSATION = 20
export const MEAL_GEN_MAX_DAILY_CONVERSATIONS = 20
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/meal-plan/config.ts
git commit -m "feat(meal-gen): add cost cap constants"
```

---

### Task 2: Feature-flag gate helper

**Files:**
- Create: `src/lib/ai/meal-plan/gate.ts`
- Create: `src/lib/ai/meal-plan/gate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/gate.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest'
import { NextResponse } from 'next/server'
import { notFoundIfDisabled } from './gate'

const original = process.env.MEAL_GEN_ENABLED

describe('notFoundIfDisabled', () => {
  afterEach(() => {
    if (original === undefined) delete process.env.MEAL_GEN_ENABLED
    else process.env.MEAL_GEN_ENABLED = original
  })

  it('returns null when MEAL_GEN_ENABLED is true', () => {
    process.env.MEAL_GEN_ENABLED = 'true'
    expect(notFoundIfDisabled()).toBeNull()
  })

  it('returns a 404 NextResponse when disabled', () => {
    process.env.MEAL_GEN_ENABLED = 'false'
    const response = notFoundIfDisabled()
    expect(response).not.toBeNull()
    expect(response).toBeInstanceOf(NextResponse)
    expect(response!.status).toBe(404)
  })

  it('returns 404 when env var is not set at all', () => {
    delete process.env.MEAL_GEN_ENABLED
    const response = notFoundIfDisabled()
    expect(response).not.toBeNull()
    expect(response!.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/gate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/gate.ts`:

```typescript
import { NextResponse } from 'next/server'

/**
 * Returns a 404 NextResponse when the feature flag is off, else null.
 * Read env at call time (not import time) so per-test overrides work.
 */
export function notFoundIfDisabled(): NextResponse | null {
  if (process.env.MEAL_GEN_ENABLED === 'true') return null
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/gate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/gate.ts src/lib/ai/meal-plan/gate.test.ts
git commit -m "feat(meal-gen): add feature-flag gate helper"
```

---

### Task 3: Cost-cap utilities

**Files:**
- Create: `src/lib/ai/meal-plan/limits.ts`
- Create: `src/lib/ai/meal-plan/limits.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/limits.test.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import type { MealGenMessage } from '@/types/meal-gen'
import {
  isConversationAtMessageCap,
  countToolCalls,
  isConversationAtToolCallCap,
  isHouseholdAtDailyCap,
} from './limits'

function msg(role: 'user' | 'assistant' | 'tool', tool_calls = 0): MealGenMessage {
  return {
    role,
    content: '',
    tool_calls: Array.from({ length: tool_calls }, (_, i) => ({ id: `t${i}`, name: 'get_recipe' as const, input: {} })),
    ts: '2026-04-21T00:00:00Z',
  }
}

describe('isConversationAtMessageCap', () => {
  it('false when under cap', () => {
    const messages: MealGenMessage[] = Array(10).fill(msg('user'))
    expect(isConversationAtMessageCap(messages)).toBe(false)
  })
  it('true when at or over cap', () => {
    const messages: MealGenMessage[] = Array(50).fill(msg('user'))
    expect(isConversationAtMessageCap(messages)).toBe(true)
  })
})

describe('countToolCalls', () => {
  it('sums tool_calls across assistant messages', () => {
    const messages: MealGenMessage[] = [msg('assistant', 2), msg('user'), msg('assistant', 3)]
    expect(countToolCalls(messages)).toBe(5)
  })
})

describe('isConversationAtToolCallCap', () => {
  it('true when total tool calls >= cap', () => {
    const messages: MealGenMessage[] = [msg('assistant', 20)]
    expect(isConversationAtToolCallCap(messages)).toBe(true)
  })
})

describe('isHouseholdAtDailyCap', () => {
  it('returns true when >= 20 conversations created today', async () => {
    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => Promise.resolve({ count: 20, error: null }),
          }),
        }),
      }),
    }
    expect(await isHouseholdAtDailyCap(supabase, 'h1')).toBe(true)
  })

  it('returns false when count is under cap', async () => {
    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => Promise.resolve({ count: 5, error: null }),
          }),
        }),
      }),
    }
    expect(await isHouseholdAtDailyCap(supabase, 'h1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/limits.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/limits.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { MealGenMessage } from '@/types/meal-gen'
import {
  MEAL_GEN_MAX_MESSAGES_PER_CONVERSATION,
  MEAL_GEN_MAX_TOOL_CALLS_PER_CONVERSATION,
  MEAL_GEN_MAX_DAILY_CONVERSATIONS,
} from './config'

export function isConversationAtMessageCap(messages: MealGenMessage[]): boolean {
  return messages.length >= MEAL_GEN_MAX_MESSAGES_PER_CONVERSATION
}

export function countToolCalls(messages: MealGenMessage[]): number {
  return messages.reduce((acc, m) => acc + (m.tool_calls?.length ?? 0), 0)
}

export function isConversationAtToolCallCap(messages: MealGenMessage[]): boolean {
  return countToolCalls(messages) >= MEAL_GEN_MAX_TOOL_CALLS_PER_CONVERSATION
}

export async function isHouseholdAtDailyCap(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<boolean> {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const { count, error } = await supabase
    .from('meal_gen_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .gte('created_at', startOfDay.toISOString())
  if (error) return false
  return (count ?? 0) >= MEAL_GEN_MAX_DAILY_CONVERSATIONS
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/limits.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/limits.ts src/lib/ai/meal-plan/limits.test.ts
git commit -m "feat(meal-gen): add cost-cap utilities"
```

---

### Task 4: Conversation context loader

Given a `conversationId`, load the conversation row plus household context (members, staples) plus recipe catalog index data in one call. Used by the message-turn route before building `RunTurnState`.

**Files:**
- Create: `src/lib/ai/meal-plan/context.ts`
- Create: `src/lib/ai/meal-plan/context.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/context.test.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { loadConversationContext } from './context'

function fakeSupabase(tables: Record<string, any>) {
  return {
    from: vi.fn((name: string) => {
      if (!tables[name]) throw new Error(`no fake for ${name}`)
      return tables[name]
    }),
  } as any
}

describe('loadConversationContext', () => {
  it('loads conversation, members, staples, recipes, and recipe tags', async () => {
    const supabase = fakeSupabase({
      meal_gen_conversations: {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { id: 'c1', household_id: 'h1', created_by: 'u1', week_start: '2026-04-20', messages: [], status: 'active', accepted_at: null, last_activity_at: '', metadata: {}, created_at: '' },
              error: null,
            }),
          }),
        }),
      },
      households: {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { anthropic_api_key: 'sk-test' },
              error: null,
            }),
          }),
        }),
      },
      household_persons: {
        select: () => ({
          eq: () => Promise.resolve({
            data: [
              { id: 'p1', display_name: 'Sean', date_of_birth: null, person_type: 'member' },
              { id: 'p2', display_name: 'Kid1', date_of_birth: '2019-03-01', person_type: 'managed_member' },
            ],
            error: null,
          }),
        }),
      },
      household_staples: {
        select: () => ({
          eq: () => Promise.resolve({ data: [{ name: 'olive oil' }, { name: 'salt' }], error: null }),
        }),
      },
      recipes: {
        select: () => ({
          eq: () => Promise.resolve({
            data: [
              { id: 'r1', title: 'Curry', recipe_tags: [{ tag_name: 'spicy' }, { tag_name: 'dinner' }] },
              { id: 'r2', title: 'Pasta', recipe_tags: [] },
            ],
            error: null,
          }),
        }),
      },
    })

    const result = await loadConversationContext(supabase, 'c1')
    expect(result).not.toBeNull()
    expect(result!.conversation.id).toBe('c1')
    expect(result!.apiKey).toBe('sk-test')
    expect(result!.household.members.length).toBe(2)
    expect(result!.household.members[0]).toMatchObject({ name: 'Sean', role: 'adult' })
    expect(result!.household.members[1]).toMatchObject({ name: 'Kid1', role: 'managed' })
    expect(result!.household.staples).toEqual(['olive oil', 'salt'])
    expect(result!.catalogRecipes.length).toBe(2)
    expect(result!.catalogRecipes[0]).toMatchObject({ id: 'r1', title: 'Curry', tags: ['spicy', 'dinner'] })
  })

  it('returns null when conversation is not found', async () => {
    const supabase = fakeSupabase({
      meal_gen_conversations: {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      },
    })
    const result = await loadConversationContext(supabase, 'missing')
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/context.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/context.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { MealGenConversationRow } from '@/types/meal-gen'
import type { HouseholdContext } from './prompt'
import type { CatalogRecipe } from './catalog-index'

export interface ConversationContext {
  conversation: MealGenConversationRow
  household: HouseholdContext['household']
  catalogRecipes: CatalogRecipe[]
  apiKey?: string
}

function personToMember(row: { display_name: string | null; date_of_birth: string | null; person_type: string }): { name: string; role: 'adult' | 'managed'; age?: number } {
  const name = row.display_name ?? '(unnamed)'
  if (row.person_type === 'member') return { name, role: 'adult' }
  if (row.date_of_birth) {
    const dob = new Date(row.date_of_birth)
    const today = new Date()
    let age = today.getUTCFullYear() - dob.getUTCFullYear()
    const m = today.getUTCMonth() - dob.getUTCMonth()
    if (m < 0 || (m === 0 && today.getUTCDate() < dob.getUTCDate())) age -= 1
    return { name, role: 'managed', age }
  }
  return { name, role: 'managed' }
}

export async function loadConversationContext(
  supabase: SupabaseClient<Database>,
  conversationId: string,
): Promise<ConversationContext | null> {
  const { data: conversation } = await supabase
    .from('meal_gen_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conversation) return null

  const [apiKeyRes, personsRes, staplesRes, recipesRes] = await Promise.all([
    supabase.from('households').select('anthropic_api_key').eq('id', conversation.household_id).maybeSingle(),
    supabase.from('household_persons').select('id, display_name, date_of_birth, person_type').eq('household_id', conversation.household_id),
    supabase.from('household_staples').select('name').eq('household_id', conversation.household_id),
    supabase.from('recipes').select('id, title, recipe_tags(tag_name)').eq('household_id', conversation.household_id),
  ])

  const members = (personsRes.data ?? []).map(personToMember)
  const staples = (staplesRes.data ?? []).map((s) => s.name)
  const catalogRecipes: CatalogRecipe[] = (recipesRes.data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    tags: ((r.recipe_tags ?? []) as Array<{ tag_name: string }>).map((t) => t.tag_name),
  }))

  return {
    conversation: conversation as unknown as MealGenConversationRow,
    household: {
      members,
      staples,
      locale: 'UK',
    },
    catalogRecipes,
    apiKey: (apiKeyRes.data as { anthropic_api_key?: string } | null)?.anthropic_api_key ?? undefined,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/context.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/context.ts src/lib/ai/meal-plan/context.test.ts
git commit -m "feat(meal-gen): add conversation context loader"
```

---

### Task 5: Message-persistence helper

After each turn, the server needs to append the new user message + assistant message(s) to `meal_gen_conversations.messages`, bump `last_activity_at`, and accumulate `tokens_in`/`tokens_out` into `metadata`.

**Files:**
- Create: `src/lib/ai/meal-plan/persist.ts`
- Create: `src/lib/ai/meal-plan/persist.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/persist.test.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { appendMessages } from './persist'
import type { MealGenMessage } from '@/types/meal-gen'

function userMsg(content: string): MealGenMessage {
  return { role: 'user', content, ts: '2026-04-21T00:00:00Z' }
}
function assistantMsg(content: string): MealGenMessage {
  return { role: 'assistant', content, ts: '2026-04-21T00:00:00Z' }
}

describe('appendMessages', () => {
  it('appends to existing messages, bumps last_activity_at, accumulates token counts', async () => {
    const existingMessages = [userMsg('hi')]
    const existingMetadata = { tokens_in: 100, tokens_out: 50 }
    const fetch = vi.fn(() => Promise.resolve({
      data: { messages: existingMessages, metadata: existingMetadata },
      error: null,
    }))
    const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    const supabase: any = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: fetch }) }),
        update,
      }),
    }

    await appendMessages(supabase, 'c1', [userMsg('plan'), assistantMsg('ok')], 200, 30)

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'hi' }),
        expect.objectContaining({ role: 'user', content: 'plan' }),
        expect.objectContaining({ role: 'assistant', content: 'ok' }),
      ]),
      metadata: expect.objectContaining({ tokens_in: 300, tokens_out: 80 }),
      last_activity_at: expect.any(String),
    }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/persist.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/persist.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import type { MealGenMessage } from '@/types/meal-gen'

export async function appendMessages(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  newMessages: MealGenMessage[],
  tokensIn: number,
  tokensOut: number,
): Promise<void> {
  const { data: existing } = await supabase
    .from('meal_gen_conversations')
    .select('messages, metadata')
    .eq('id', conversationId)
    .maybeSingle()

  if (!existing) return

  const priorMessages = (existing.messages as unknown as MealGenMessage[] | null) ?? []
  const priorMeta = (existing.metadata as { tokens_in?: number; tokens_out?: number } | null) ?? {}

  const combinedMessages = [...priorMessages, ...newMessages]
  const nextMetadata = {
    ...(existing.metadata as Record<string, unknown> | null ?? {}),
    tokens_in: (priorMeta.tokens_in ?? 0) + tokensIn,
    tokens_out: (priorMeta.tokens_out ?? 0) + tokensOut,
  }

  await supabase
    .from('meal_gen_conversations')
    .update({
      messages: combinedMessages as unknown as Json,
      metadata: nextMetadata as unknown as Json,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/persist.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/persist.ts src/lib/ai/meal-plan/persist.test.ts
git commit -m "feat(meal-gen): add message-persistence helper"
```

---

### Task 6: Accept flow — drafts → meal_plan_entries

Promote all drafts of a conversation into real `meal_plan_entries` rows, then mark the conversation `accepted`. Atomic enough via array-insert; status update is idempotent.

**Files:**
- Create: `src/lib/ai/meal-plan/accept.ts`
- Create: `src/lib/ai/meal-plan/accept.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/ai/meal-plan/accept.test.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { acceptConversation } from './accept'

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
      throw new Error('unexpected table ' + t)
    }),
  }
  return { supabase, insertRows, updateChain }
}

describe('acceptConversation', () => {
  it('promotes each draft to a meal_plan_entries row with correct mapping by source', async () => {
    const { supabase, insertRows, updateChain } = fakeContext({
      conversation: { id: 'c1', household_id: 'h1', status: 'active' },
      drafts: [
        { id: 'd1', date: '2026-04-22', meal_type: 'dinner', source: 'recipe', recipe_id: 'r1', inventory_item_id: null, custom_name: null, custom_ingredients: null, servings: 4, assigned_to: [], notes: null },
        { id: 'd2', date: '2026-04-23', meal_type: 'dinner', source: 'custom', recipe_id: null, inventory_item_id: null, custom_name: 'Takeaway', custom_ingredients: null, servings: 4, assigned_to: [], notes: 'pizza night' },
        { id: 'd3', date: '2026-04-24', meal_type: 'dinner', source: 'custom_with_ingredients', recipe_id: null, inventory_item_id: null, custom_name: 'DIY tacos', custom_ingredients: [{ name: 'tortilla', quantity: 8, unit: 'ct' }], servings: 4, assigned_to: [], notes: null },
        { id: 'd4', date: '2026-04-25', meal_type: 'dinner', source: 'leftover', recipe_id: null, inventory_item_id: 'i1', custom_name: null, custom_ingredients: null, servings: 2, assigned_to: [], notes: null },
      ],
    })

    await acceptConversation(supabase, 'c1', 'u1')

    expect(insertRows).toHaveBeenCalledOnce()
    const rowsArg = insertRows.mock.calls[0][0]
    expect(rowsArg).toHaveLength(4)
    expect(rowsArg[0]).toMatchObject({ household_id: 'h1', date: '2026-04-22', meal_type: 'dinner', recipe_id: 'r1', custom_name: null })
    expect(rowsArg[1]).toMatchObject({ custom_name: 'Takeaway', recipe_id: null })
    expect(rowsArg[2]).toMatchObject({ custom_name: 'DIY tacos', custom_ingredients: [{ name: 'tortilla', quantity: 8, unit: 'ct' }] })
    expect(rowsArg[3]).toMatchObject({ inventory_item_id: 'i1', recipe_id: null, custom_name: null })

    expect(updateChain).toHaveBeenCalledWith(expect.objectContaining({
      status: 'accepted',
      accepted_at: expect.any(String),
    }))
  })

  it('rejects if conversation is already accepted', async () => {
    const { supabase } = fakeContext({
      conversation: { id: 'c1', household_id: 'h1', status: 'accepted' },
      drafts: [],
    })
    await expect(acceptConversation(supabase, 'c1', 'u1')).rejects.toThrow(/already/)
  })

  it('rejects if there are no drafts', async () => {
    const { supabase } = fakeContext({
      conversation: { id: 'c1', household_id: 'h1', status: 'active' },
      drafts: [],
    })
    await expect(acceptConversation(supabase, 'c1', 'u1')).rejects.toThrow(/no drafts/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/accept.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/lib/ai/meal-plan/accept.ts`:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'

export interface AcceptResult {
  inserted_ids: string[]
}

export async function acceptConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  userId: string,
): Promise<AcceptResult> {
  const { data: conversation } = await supabase
    .from('meal_gen_conversations')
    .select('id, household_id, status')
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

  await supabase
    .from('meal_gen_conversations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  return { inserted_ids: (inserted ?? []).map((r) => r.id) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/accept.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/meal-plan/accept.ts src/lib/ai/meal-plan/accept.test.ts
git commit -m "feat(meal-gen): add accept flow (drafts to meal_plan_entries)"
```

---

### Task 7: POST `/api/meal-plans/generate` — create conversation

**Files:**
- Create: `src/app/api/meal-plans/generate/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/meal-plans/generate/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'
import { isHouseholdAtDailyCap } from '@/lib/ai/meal-plan/limits'

// POST /api/meal-plans/generate — create a new meal-gen conversation
export async function POST(request: NextRequest) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as { household_id?: string; week_start?: string } | null
  if (!body?.household_id || !body?.week_start) {
    return NextResponse.json({ error: 'household_id and week_start are required' }, { status: 400 })
  }

  if (await isHouseholdAtDailyCap(supabase, body.household_id)) {
    return NextResponse.json({ error: 'Daily meal-gen conversation limit reached for this household' }, { status: 429 })
  }

  const { data, error } = await supabase
    .from('meal_gen_conversations')
    .insert({
      household_id: body.household_id,
      created_by: user.id,
      week_start: body.week_start,
    })
    .select('id, household_id, created_by, week_start, status, created_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create conversation' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/meal-plans/generate/route.ts
git commit -m "feat(meal-gen): POST /api/meal-plans/generate (create conversation)"
```

---

### Task 8: GET `/api/meal-plans/generate/[id]` — resume

Return the full conversation (messages, metadata) and current drafts for resume.

**Files:**
- Create: `src/app/api/meal-plans/generate/[id]/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/meal-plans/generate/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'

// GET /api/meal-plans/generate/[id] — full conversation + drafts for resume
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [conversationRes, draftsRes] = await Promise.all([
    supabase.from('meal_gen_conversations').select('*').eq('id', id).maybeSingle(),
    supabase.from('meal_gen_drafts').select('*').eq('conversation_id', id).order('date', { ascending: true }),
  ])

  if (!conversationRes.data) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  return NextResponse.json({
    conversation: conversationRes.data,
    drafts: draftsRes.data ?? [],
  })
}
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/meal-plans/generate/[id]/route.ts
git commit -m "feat(meal-gen): GET /api/meal-plans/generate/[id] (resume)"
```

---

### Task 9: POST `/api/meal-plans/generate/[id]/message` — run a turn

The central route. Loads context, runs the orchestrator, persists the new messages, returns the turn result + updated drafts.

**Files:**
- Create: `src/app/api/meal-plans/generate/[id]/message/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/meal-plans/generate/[id]/message/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'
import { loadConversationContext } from '@/lib/ai/meal-plan/context'
import { buildCatalogIndex } from '@/lib/ai/meal-plan/catalog-index'
import { buildSystemPrompt } from '@/lib/ai/meal-plan/prompt'
import { runTurn } from '@/lib/ai/meal-plan/conversation'
import { appendMessages } from '@/lib/ai/meal-plan/persist'
import {
  isConversationAtMessageCap,
  isConversationAtToolCallCap,
} from '@/lib/ai/meal-plan/limits'
import type { MealGenMessage } from '@/types/meal-gen'

// POST /api/meal-plans/generate/[id]/message — append user message, run model turn
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as { text?: string } | null
  if (!body?.text || !body.text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const loaded = await loadConversationContext(supabase, id)
  if (!loaded) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  if (loaded.conversation.status !== 'active') {
    return NextResponse.json({ error: `Conversation is ${loaded.conversation.status}` }, { status: 409 })
  }

  const prior = (loaded.conversation.messages as unknown as MealGenMessage[] | null) ?? []
  if (isConversationAtMessageCap(prior)) {
    return NextResponse.json({ error: 'Conversation message cap reached' }, { status: 429 })
  }
  if (isConversationAtToolCallCap(prior)) {
    return NextResponse.json({ error: 'Conversation tool-call cap reached' }, { status: 429 })
  }

  const systemPrompt = buildSystemPrompt({
    household: loaded.household,
    catalogIndex: buildCatalogIndex(loaded.catalogRecipes),
  })

  let result
  try {
    result = await runTurn(
      { systemPrompt, prior, apiKey: loaded.apiKey },
      body.text,
      { supabase, householdId: loaded.conversation.household_id, userId: user.id, conversationId: id },
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Model turn failed: ${msg}` }, { status: 502 })
  }

  const userMessage: MealGenMessage = { role: 'user', content: body.text, ts: new Date().toISOString() }
  await appendMessages(
    supabase,
    id,
    [userMessage, ...result.assistantMessages],
    result.tokensIn,
    result.tokensOut,
  )

  const { data: drafts } = await supabase
    .from('meal_gen_drafts')
    .select('*')
    .eq('conversation_id', id)
    .order('date', { ascending: true })

  return NextResponse.json({
    assistantMessages: result.assistantMessages,
    stoppedReason: result.stoppedReason,
    toolCallsMade: result.toolCallsMade,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    drafts: drafts ?? [],
  })
}
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/meal-plans/generate/[id]/message/route.ts
git commit -m "feat(meal-gen): POST /api/meal-plans/generate/[id]/message"
```

---

### Task 10: GET `/api/meal-plans/generate/[id]/drafts` — current drafts only

**Files:**
- Create: `src/app/api/meal-plans/generate/[id]/drafts/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/meal-plans/generate/[id]/drafts/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'

// GET /api/meal-plans/generate/[id]/drafts — current draft entries for this conversation
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('meal_gen_drafts')
    .select('*')
    .eq('conversation_id', id)
    .order('date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/meal-plans/generate/[id]/drafts/route.ts
git commit -m "feat(meal-gen): GET /api/meal-plans/generate/[id]/drafts"
```

---

### Task 11: PATCH `/api/meal-plans/generate/[id]/draft` — user edit from grid

User edits a draft card directly in the week grid (e.g., swap recipe, change servings). Updates the draft and appends a system-like message so the model stays coherent.

**Files:**
- Create: `src/app/api/meal-plans/generate/[id]/draft/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/meal-plans/generate/[id]/draft/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'
import { appendMessages } from '@/lib/ai/meal-plan/persist'
import type { MealGenMessage } from '@/types/meal-gen'

// PATCH /api/meal-plans/generate/[id]/draft — user-edited a draft from the grid
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as {
    date?: string
    meal_type?: string
    update?: Record<string, unknown>
    action?: 'update' | 'delete'
  } | null

  if (!body?.date || !body?.meal_type || !body.action) {
    return NextResponse.json({ error: 'date, meal_type, and action are required' }, { status: 400 })
  }

  if (body.action === 'delete') {
    const { error } = await supabase
      .from('meal_gen_drafts')
      .delete()
      .eq('conversation_id', id)
      .eq('date', body.date)
      .eq('meal_type', body.meal_type)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    if (!body.update) return NextResponse.json({ error: 'update payload required for action=update' }, { status: 400 })
    const { error } = await supabase
      .from('meal_gen_drafts')
      .update(body.update)
      .eq('conversation_id', id)
      .eq('date', body.date)
      .eq('meal_type', body.meal_type)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const note: MealGenMessage = {
    role: 'user',
    content: `(User edited ${body.date} ${body.meal_type} in the grid: ${body.action}${body.update ? ' ' + JSON.stringify(body.update) : ''})`,
    ts: new Date().toISOString(),
  }
  await appendMessages(supabase, id, [note], 0, 0)

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/meal-plans/generate/[id]/draft/route.ts
git commit -m "feat(meal-gen): PATCH /api/meal-plans/generate/[id]/draft"
```

---

### Task 12: POST `/api/meal-plans/generate/[id]/accept` — promote drafts

**Files:**
- Create: `src/app/api/meal-plans/generate/[id]/accept/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/meal-plans/generate/[id]/accept/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'
import { acceptConversation } from '@/lib/ai/meal-plan/accept'

// POST /api/meal-plans/generate/[id]/accept — promote drafts to meal_plan_entries
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await acceptConversation(supabase, id, user.id)
    return NextResponse.json(result, { status: 200 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = /already|no drafts|not found/i.test(msg) ? 409 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/meal-plans/generate/[id]/accept/route.ts
git commit -m "feat(meal-gen): POST /api/meal-plans/generate/[id]/accept"
```

---

### Task 13: POST `/api/meal-plans/generate/[id]/discard` — mark abandoned

**Files:**
- Create: `src/app/api/meal-plans/generate/[id]/discard/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/meal-plans/generate/[id]/discard/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'

// POST /api/meal-plans/generate/[id]/discard — mark conversation abandoned
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: conversation } = await supabase
    .from('meal_gen_conversations')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  if (conversation.status !== 'active') {
    return NextResponse.json({ error: `Conversation is ${conversation.status}` }, { status: 409 })
  }

  const { error } = await supabase
    .from('meal_gen_conversations')
    .update({ status: 'abandoned' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/meal-plans/generate/[id]/discard/route.ts
git commit -m "feat(meal-gen): POST /api/meal-plans/generate/[id]/discard"
```

---

### Task 14: GET `/api/meal-plans/generate/recent` — resume dropdown

List active + abandoned conversations for the current household, most recent first, for the "Recent plans" resume dropdown.

**Files:**
- Create: `src/app/api/meal-plans/generate/recent/route.ts`

- [ ] **Step 1: Implement**

Create `src/app/api/meal-plans/generate/recent/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'

// GET /api/meal-plans/generate/recent?householdId=... — list active/abandoned conversations
export async function GET(request: NextRequest) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const householdId = request.nextUrl.searchParams.get('householdId')
  if (!householdId) return NextResponse.json({ error: 'householdId is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('meal_gen_conversations')
    .select('id, week_start, status, created_at, last_activity_at, created_by')
    .eq('household_id', householdId)
    .in('status', ['active', 'abandoned'])
    .order('last_activity_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
```

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/meal-plans/generate/recent/route.ts
git commit -m "feat(meal-gen): GET /api/meal-plans/generate/recent"
```

---

### Task 15: Happy-path lifecycle integration test

A single test exercising create → message → accept using fakes for both Supabase and Anthropic. Catches wiring mistakes between the helpers.

**Files:**
- Create: `src/lib/ai/meal-plan/lifecycle.integration.test.ts`

- [ ] **Step 1: Write the test**

Create `src/lib/ai/meal-plan/lifecycle.integration.test.ts`:

```typescript
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { runTurn } from './conversation'
import { buildSystemPrompt } from './prompt'
import { buildCatalogIndex } from './catalog-index'
import { acceptConversation } from './accept'

describe('meal-gen lifecycle (library only — no HTTP)', () => {
  it('runs a turn that proposes a plan, then accept promotes drafts', async () => {
    // --- Stage 1: model turn that calls propose_plan once, then end_turn ---
    const fakeClient = {
      messages: {
        create: vi.fn()
          .mockResolvedValueOnce({
            stop_reason: 'tool_use',
            content: [
              { type: 'text', text: 'Here is a quick plan.' },
              {
                type: 'tool_use',
                id: 'tu1',
                name: 'propose_plan',
                input: {
                  entries: [
                    { date: '2026-04-22', meal_type: 'dinner', source: 'recipe', recipe_id: 'r1', servings: 4 },
                  ],
                },
              },
            ],
            usage: { input_tokens: 500, output_tokens: 30 },
          })
          .mockResolvedValueOnce({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'Done.' }],
            usage: { input_tokens: 520, output_tokens: 10 },
          }),
      },
    }

    const fakeDispatch = vi.fn(() => Promise.resolve({ content: { draft_ids: ['d1'] } }))
    const ctx = { supabase: {} as any, householdId: 'h1', userId: 'u1', conversationId: 'c1' }
    const systemPrompt = buildSystemPrompt({
      household: { members: [{ name: 'Sean', role: 'adult' }], staples: [], locale: 'UK' },
      catalogIndex: buildCatalogIndex([{ id: 'r1', title: 'Curry', tags: ['dinner'] }]),
    })

    const result = await runTurn(
      { systemPrompt, prior: [], apiKey: 'sk' },
      'Plan dinner for Wednesday',
      ctx,
      { client: fakeClient, dispatch: fakeDispatch },
    )

    expect(result.stoppedReason).toBe('end_turn')
    expect(result.toolCallsMade).toBe(1)
    expect(result.assistantMessages).toHaveLength(2)
    expect(fakeDispatch).toHaveBeenCalledWith('propose_plan', ctx, expect.any(Object))

    // --- Stage 2: accept the conversation ---
    const supabaseAccept: any = {
      from: vi.fn((t: string) => {
        if (t === 'meal_gen_conversations') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: 'c1', household_id: 'h1', status: 'active' }, error: null }),
              }),
            }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }
        }
        if (t === 'meal_gen_drafts') {
          return {
            select: () => ({
              eq: () => ({
                order: () => Promise.resolve({
                  data: [
                    { id: 'd1', date: '2026-04-22', meal_type: 'dinner', source: 'recipe', recipe_id: 'r1', inventory_item_id: null, custom_name: null, custom_ingredients: null, servings: 4, assigned_to: [], notes: null },
                  ],
                  error: null,
                }),
              }),
            }),
            delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }
        }
        if (t === 'meal_plan_entries') {
          return {
            insert: () => ({
              select: () => Promise.resolve({ data: [{ id: 'e1' }], error: null }),
            }),
          }
        }
        throw new Error('unexpected table ' + t)
      }),
    }

    const acceptResult = await acceptConversation(supabaseAccept, 'c1', 'u1')
    expect(acceptResult.inserted_ids).toEqual(['e1'])
  })
})
```

- [ ] **Step 2: Run the test**

Run: `doppler run -- npm run test:run -- src/lib/ai/meal-plan/lifecycle.integration.test.ts`
Expected: PASS (1 test).

- [ ] **Step 3: Run the full test suite**

Run: `doppler run -- npm run test:run`
Expected: all tests pass (~125+).

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/meal-plan/lifecycle.integration.test.ts
git commit -m "test(meal-gen): lifecycle integration — turn + accept"
```

---

### Task 16: Final verification

- [ ] **Step 1: Full test suite**

Run: `doppler run -- npm run test:run`
Expected: all pass.

- [ ] **Step 2: Build**

Run: `doppler run -- npm run build`
Expected: succeeds.

- [ ] **Step 3: Lint check**

Run: `doppler run -- npm run lint 2>&1 | awk '/\/src\/app\/api\/meal-plans\/generate|\/src\/lib\/ai\/meal-plan/{file=$0; next} /error|warning/{if(file) print file": "$0}'`
Expected: no new errors from chunk-2b files (test-fake `any`s are behind file-level eslint-disable comments where needed).

- [ ] **Step 4: Route inventory check**

Run: `ls src/app/api/meal-plans/generate/ src/app/api/meal-plans/generate/\[id\]/`
Expected: the 8 route.ts files listed in "File Structure".

- [ ] **Step 5: Git log sanity check**

Run: `git log --oneline main..HEAD | head -20`
Expected: 14 commits from tasks 1–15 plus the plan commit.

No commit for this task — gate only.

---

## Post-Chunk-2b Notes

**What this chunk does NOT do, by design:**

- Accept does not generate a shopping list. The list builder + packet rounding lives in chunk 4.
- Accept does not confirm when existing `meal_plan_entries` overlap target slots. UI (chunk 3) handles that.
- No UI — everything is curl-testable. Chunk 3 wires the chat drawer and week-grid draft overlay.
- No streaming — the message route blocks until the model completes its turn. Within Vercel's 300s default, this is comfortable for planning conversations.
- No abandonment cron — conversations marked `active` stay active until the user discards or accepts.

**To test manually (before chunk 3 ships UI):**

```bash
# Enable the flag locally (or set in Doppler)
export MEAL_GEN_ENABLED=true

# Create a conversation
curl -X POST http://localhost:3000/api/meal-plans/generate \
  -H 'Content-Type: application/json' \
  -b "sb-access-token=..." \
  -d '{"household_id": "h-uuid", "week_start": "2026-04-20"}'

# Send a message (returns full turn result)
curl -X POST http://localhost:3000/api/meal-plans/generate/<id>/message \
  -H 'Content-Type: application/json' \
  -b "sb-access-token=..." \
  -d '{"text": "Plan 4 dinners, nothing too heavy"}'

# Accept the plan
curl -X POST http://localhost:3000/api/meal-plans/generate/<id>/accept \
  -b "sb-access-token=..."
```

## Flag for Chunk 3 (UI)

- Chat drawer POSTs to `/message`; render `assistantMessages` streamed-in-appearance (though underlying API is non-streaming).
- Week grid overlays `drafts` from `/drafts` or from the `/message` response.
- Draft edits use PATCH `/draft` with `action: 'update' | 'delete'`.
- Accept modal summary = count of drafts; no conflict resolution yet.

## Flag for Chunk 4 (shopping + packet rounding)

- `/api/meal-plans/generate/[id]/accept` needs to optionally also call the shopping-list generator. Either extend the accept route or chain a follow-up call client-side.
- `/api/packet-sizes` CRUD lands here.
- `check_packet_sizes` tool should prefer household-override rows over globals (flagged in chunk 2a review).
