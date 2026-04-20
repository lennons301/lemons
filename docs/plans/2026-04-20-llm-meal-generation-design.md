# LLM Meal Plan Generation — Design

**Date:** 2026-04-20
**Status:** Approved

## Scope

### In This Phase

- Conversational LLM-assisted meal plan generation (1:1 dialogue between the planning user and Claude).
- Recipe catalog access via compact index in cached prompt + tools for deep fetches.
- Web search fallback with approval-gated scrape-and-save into the household catalog.
- Packet-size awareness: curated seed table (UK), LLM-aware planning (soft signal), shopping-time rounding (hard).
- Custom slot entries without recipes (e.g. "takeaway", "out for dinner") — model can propose, user can declare.
- Custom slot entries with ad-hoc ingredients (e.g. "DIY tacos") feeding into shopping generation.
- Inventory-leftover slots via a tool that returns cooked-meal items with remaining servings (gracefully empty today; lights up when inventory is populated).
- Stream-as-you-go UI: draft entries appear in the week grid as the model proposes them.
- Conversation persistence for resume, audit, and future prompt tuning.

### Deferred (Future Phases)

- **Inventory-aware recipe selection at plan time** — goes deeper once inventory data exists (meal gen already tolerates empty inventory by returning empty from the leftovers tool).
- **Supermarket API integration** — price-aware packet-size selection, live availability.
- **Cross-household recipe library** — would require moving the catalog out of the cached prompt into tool-based search.
- **Eval harness in CI** — LLM evals run manually first; CI gating later.
- **Multi-week planning** — single-week scope for v1.
- **Shared multi-user chat** — v1 is a 1:1 dialogue between one member and the model.

## Architecture

The feature lives in `src/lib/ai/meal-plan/` as a distinct module, on the Approach B extraction boundary. A new `/api/meal-plans/generate` streaming endpoint runs a conversation loop with Claude Sonnet 4.6. The Anthropic SDK is called with prompt caching on the static context block.

```
┌──────────────────┐      SSE stream       ┌──────────────────────────┐
│ Chat drawer (UI) │ ◄──────────────────── │ /api/meal-plans/generate │
│  + week grid     │                       │   (conversation loop)    │
│  overlays drafts │ ──── POST message ──► │                          │
└──────────────────┘                       │  ┌────────────────────┐  │
                                           │  │ Anthropic SDK      │  │
                                           │  │ (Claude Sonnet 4.6)│  │
                                           │  └────────────────────┘  │
                                           │       │        ▲         │
                                           │       ▼        │         │
                                           │  ┌────────────────────┐  │
                                           │  │ Tool implementations│ │
                                           │  │  - get_recipe       │ │
                                           │  │  - search_web       │ │
                                           │  │  - scrape_and_save  │ │
                                           │  │  - check_packet_sizes│ │
                                           │  │  - search_inventory │ │
                                           │  │  - get_calendar     │ │
                                           │  │  - propose_plan     │ │
                                           │  │  - remove_slot      │ │
                                           │  └────────────────────┘  │
                                           │           │              │
                                           └───────────┼──────────────┘
                                                       ▼
                                           ┌──────────────────────┐
                                           │ Supabase (Postgres)  │
                                           │  - meal_gen_conversations │
                                           │  - meal_gen_drafts        │
                                           │  - packet_sizes           │
                                           │  - recipes / ingredients  │
                                           └──────────────────────┘
```

On **accept**, draft rows are transactionally promoted to `meal_plan_entries`, and the existing shopping-list generator runs with a new packet-rounding step layered on top.

## Interaction Model

A 1:1 conversation between the planning user and Claude, designed to capture the soft context that a form can't (who's in which night, leftovers to use up, weeknight vs weekend energy).

**Lifecycle:**

1. User clicks **Generate plan ✨** on `/meal-plans`. A side drawer (desktop) / full-screen sheet (mobile) opens.
2. Server creates `meal_gen_conversations` row with `status=active`, opens SSE stream.
3. User types a message. Server appends, calls Claude with full history + cached context + tools, streams response back.
4. When the model calls `propose_plan(entries[])`, server upserts `meal_gen_drafts` rows and pushes state to client. Week grid renders drafts with a distinct visual treatment (dashed border, sparkle icon, muted colour).
5. User can edit drafts directly in the grid; edits feed back as system messages so the model stays coherent.
6. Once ≥3 drafts exist, a collapsible **Shopping preview** card appears at the bottom of the chat showing the aggregated list with packet rounding + waste annotations.
7. User clicks **Accept plan**. Confirmation modal summarizes entries and shopping list. On confirm, drafts → `meal_plan_entries` transactionally; shopping list generated; conversation `status=accepted`; drawer closes.
8. Abandoned conversations stay `status=active` with `last_activity_at`; a daily cron marks them `abandoned` after 24h. Users can resume any non-accepted conversation from a "Recent plans" dropdown.

## Data Model

### New Tables

**`meal_gen_conversations`**

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, default `gen_random_uuid()` |
| household_id | uuid | FK → households, NOT NULL |
| created_by | uuid | FK → profiles, NOT NULL |
| week_start | date | NOT NULL — target week (Monday) |
| messages | jsonb | NOT NULL, default `'[]'::jsonb` — array of `{role, content, tool_calls?, tool_results?, ts}` |
| status | text | CHECK (`active` / `accepted` / `abandoned`), default `active` |
| accepted_at | timestamptz | nullable |
| last_activity_at | timestamptz | default `now()` |
| metadata | jsonb | default `'{}'::jsonb` — tokens_in, tokens_out, cache_hit_ratio, tool_call_counts |
| created_at | timestamptz | default `now()` |

**`meal_gen_drafts`**

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, default `gen_random_uuid()` |
| conversation_id | uuid | FK → meal_gen_conversations, ON DELETE CASCADE, NOT NULL |
| date | date | NOT NULL |
| meal_type | text | CHECK (`breakfast` / `lunch` / `dinner` / `snack`), NOT NULL |
| source | text | CHECK (`recipe` / `custom` / `custom_with_ingredients` / `leftover`), NOT NULL |
| recipe_id | uuid | FK → recipes, nullable |
| inventory_item_id | uuid | FK → inventory_items, nullable |
| custom_name | text | nullable |
| custom_ingredients | jsonb | nullable — array of `{name, quantity, unit}` |
| servings | integer | NOT NULL, default 1 |
| assigned_to | uuid[] | default `'{}'::uuid[]` |
| notes | text | nullable |
| created_at | timestamptz | default `now()` |

**Constraints:**
- UNIQUE `(conversation_id, date, meal_type)` — upsert semantics.
- CHECK: source/column invariant enforced explicitly —
  - `source='recipe'` ⇒ `recipe_id IS NOT NULL` AND `inventory_item_id IS NULL` AND `custom_name IS NULL` AND `custom_ingredients IS NULL`
  - `source='leftover'` ⇒ `inventory_item_id IS NOT NULL` AND `recipe_id IS NULL` AND `custom_name IS NULL` AND `custom_ingredients IS NULL`
  - `source='custom'` ⇒ `custom_name IS NOT NULL` AND `recipe_id IS NULL` AND `inventory_item_id IS NULL` AND `custom_ingredients IS NULL`
  - `source='custom_with_ingredients'` ⇒ `custom_name IS NOT NULL` AND `custom_ingredients IS NOT NULL` AND `recipe_id IS NULL` AND `inventory_item_id IS NULL`

**`packet_sizes`**

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, default `gen_random_uuid()` |
| ingredient_name | text | Normalized (matches `recipe_ingredients.name`), NOT NULL |
| pack_quantity | numeric | NOT NULL |
| pack_unit | text | NOT NULL |
| locale | text | NOT NULL, default `'UK'` |
| is_default | boolean | NOT NULL, default `true` — the "typical" pack for this ingredient |
| household_id | uuid | nullable — null = global, set = household override |
| notes | text | nullable — e.g. "common in Tesco/Sainsbury" |
| created_at | timestamptz | default `now()` |

**Seed:** ~200 rows covering UK supermarket basics, loaded from `supabase/seed/packet_sizes_uk.json`.

### Modified Tables

**`meal_plan_entries`** — two new nullable columns:

| Column | Type | Notes |
|---|---|---|
| custom_ingredients | jsonb | nullable — used when `recipe_id` is null but the custom slot carries shopping-list ingredients |
| inventory_item_id | uuid | nullable — FK → inventory_items, for leftover entries |

**`todo_items`** — one new nullable column for packet-rounding metadata on shopping items:

| Column | Type | Notes |
|---|---|---|
| metadata | jsonb | nullable — `{required_qty, packed_qty, waste_qty, pack_size}` for packet-rounded shopping items; extensible for future uses |

**RLS:**
- `meal_gen_conversations`, `meal_gen_drafts`: household-scoped (existing pattern).
- `packet_sizes`: all authenticated users can read global rows (`household_id IS NULL`); household members can read/write their own overrides.

## API Routes

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/meal-plans/generate` | Create conversation, open SSE stream. Body: `{ household_id, week_start }` |
| POST | `/api/meal-plans/generate/[id]/message` | Append user message, run model turn, stream response |
| GET | `/api/meal-plans/generate/[id]` | Fetch full conversation (messages + drafts) for resume |
| GET | `/api/meal-plans/generate/[id]/drafts` | Fetch current draft entries |
| PATCH | `/api/meal-plans/generate/[id]/draft` | User edit to draft from the grid; appends system message to conversation |
| POST | `/api/meal-plans/generate/[id]/accept` | Promote drafts → `meal_plan_entries`, generate shopping list, close conversation |
| POST | `/api/meal-plans/generate/[id]/discard` | Mark conversation `abandoned`; drafts cascade-delete |
| GET | `/api/meal-plans/generate/recent` | List recent non-accepted conversations for resume dropdown |
| GET | `/api/packet-sizes` | List packet sizes (globals + household overrides) |
| POST | `/api/packet-sizes` | Create household-level packet size override |
| PATCH | `/api/packet-sizes/[id]` | Update override |
| DELETE | `/api/packet-sizes/[id]` | Remove override |

## LLM Interface

**Model:** Claude Sonnet 4.6. Household API key read from `household_api_keys` (same pattern as recipe extraction).

**System prompt shape** with `cache_control` on the static block:

```
<cached block — 1-hour TTL>
You are a household meal planner...

<household>
  Members: Sean (adult), Partner (adult), Kid1 (7), Kid2 (4)
  Staples: olive oil, salt, pasta, eggs, milk
  Locale: UK
</household>

<recipe_catalog>
  [r:abc123] Thai Green Curry | thai, curry, chicken, spicy, 30min
  [r:def456] Spaghetti Bolognese | italian, pasta, beef, weeknight
  ...one compact line per recipe, ~20 tokens each
</recipe_catalog>

<planning_guidelines>
  Prefer recipes from the household catalog. Search the web only when
  the catalog is thin for the user's request or they ask explicitly.
  When proposing recipes, consider packet-size compatibility — half a
  tin of X is fine if another recipe uses the rest.
  Avoid repeating the same recipe in a 7-day window unless asked.
</planning_guidelines>

<tools>...tool definitions...</tools>
</cached block>

<conversation history>
  ...role/content turns...
</conversation history>
```

Recipes referenced by compact id token (`[r:abc123]`) in both directions — the model can mention them without a tool call and the server parses them out on the way in.

**Tools exposed:**

| Tool | Input | Output | Purpose |
|---|---|---|---|
| `get_recipe` | `{id}` | Full recipe: ingredients, instructions, times | Deep fetch when proposing or deciding |
| `search_web` | `{query}` | `[{url, title, snippet}]` | Native Anthropic web-search integration |
| `scrape_and_save_recipe` | `{url}` | `{recipe_id, title, summary}` | Runs URL through `extract-recipe.ts`, persists to `recipes`, returns id |
| `search_inventory_leftovers` | `{meal_type?}` | `[{id, name, servings_available, source_recipe_id}]` | Cooked-meal inventory; empty today |
| `get_calendar_events` | `{from, to}` | Events overlapping the window | Lets model avoid heavy meals on busy nights |
| `check_packet_sizes` | `{ingredient_names: [string]}` | `[{name, packs: [{qty, unit, is_default}]}]` | Packet awareness without stuffing prompt |
| `propose_plan` | `{entries: [...]}` | `{ok: true, draft_ids: [...]}` | Upserts drafts; entry shape matches `meal_gen_drafts` row |
| `remove_slot` | `{date, meal_type}` | `{ok: true}` | Removes from draft |

**No `search_recipes` tool.** The catalog index is always in the cached prompt; the model references recipes by id inline. Avoids round-trips on the most common operation.

**Token budget (target):**
- System prompt: ~10k tokens @ ~500 recipes (cached → $0.003/turn after first).
- Expected cost per completed plan: $0.05–$0.15.

## Packet-Size Mechanics

**Seed data** (migration-loaded from JSON): ~200 rows — produce (carrots 1kg, onions 3-pack, peppers 3-pack), dairy (milk 2L/4pt, butter 250g), meat (chicken breasts 600g pack, mince 500g), pantry basics. Locale = `UK`.

**Two integration points:**

### Plan-generation time (soft signal)

Model calls `check_packet_sizes([ingredients])` when weighing recipe choices. Planning guideline in the system prompt nudges it to prefer combinations where leftover amounts get used up rather than wasted. Not a hard optimization — just awareness.

### Shopping-generation time (hard rounding)

When shopping list is generated on accept, existing `src/lib/utils/shopping-aggregation.ts` runs as today. A new `src/lib/utils/pack-round.ts` step then:

1. For each aggregated line, look up packet sizes (`household_id = X OR household_id IS NULL`, prefer household override).
2. If multiple pack sizes exist, pick the smallest pack whose quantity ≥ required quantity. If all are smaller than required, pick a combination (e.g., 1kg + 500g to cover 1.2kg).
3. Round quantity **up** to the packed total. Never round down.
4. Attach metadata to the shopping item: `{required_qty, packed_qty, waste_qty, pack_size}` in a new `todo_items.metadata jsonb` column (added as part of this phase's migration).
5. Shopping list UI: `Carrots — 1kg pack (needed: 600g)`. Annotation `— 400g leftover` if `waste_qty / packed_qty > 0.1`.

**Fallback:** no packet-size row → listed as-is with raw aggregated quantity. Model can propose a household override via chat.

## Web Search + Scrape Flow

**Discovery:**
- Model calls `search_web` with a query (e.g. `"weeknight salmon traybake uk"`).
- Anthropic's native web search returns `[{url, title, snippet}]`.
- Model presents one or two promising results in chat: *"I found a BBC Good Food lemon herb salmon that'd work — want me to add it?"*

**Approval → scrape:**
- User says yes in chat.
- Model calls `scrape_and_save_recipe("https://...")`.
- Server fetches the URL, extracts via existing `src/lib/ai/extract-recipe.ts` pipeline, inserts into `recipes` with `source_url` set and `created_by = requesting user`.
- Duplicate check: if a recipe with the same `source_url` already exists in the household, return the existing id instead of duplicating.
- Returns new `recipe_id` to the model, which then calls `propose_plan(...)` referencing it.

**Failure modes:**
- Scrape fails (paywalled, bot-blocked, extraction timeout) → tool returns error. Model falls back to proposing the user add it manually, or picks another catalog recipe.
- Web search rate limit → surfaced in chat as a system message.

**Cost control:** Hard cap of 10 `search_web` calls per conversation. Exceeding → tool returns error; model has to work with what it has.

## UI

### Chat Drawer

- Header: "Plan for week of {week_start}" + status pill (drafting / ready to accept) + minimize/close.
- Message list:
  - User + assistant turns rendered normally.
  - Tool calls render as small collapsed chips (`🔍 searched web for salmon traybake`, `📖 looked up Thai Green Curry`). Expandable on click; collapsed by default.
- Input: multiline textbox + send.
- Empty state: suggested-prompt chips (`Plan 4 dinners, Tuesday we're out`, `Use what we've got, veggie Wednesday`, `Something for two 7-year-olds`).
- Footer: **Accept plan** (enabled when ≥1 draft exists) | **Discard** | **Regenerate**.
- Shopping preview: collapsible card at the bottom when ≥3 drafts exist.

### Week Grid Behind Drawer

- Existing grid stays visible.
- Draft entries render distinctly: dashed border, sparkle icon, slightly muted colour.
- Real entries (already accepted for that week) render normally; system prompt instructs the model not to overwrite them unless asked.
- User can drag/edit draft cards in the grid → API call → system message appended to conversation so model stays coherent.

### Accept Modal

Single confirmation: "This will create {N} meal plan entries and a shopping list with {M} items." If real entries exist for slots the drafts would replace: "{K} slots already have meals — replace them?" with explicit yes.

### Mobile

Chat is full-screen. A "Show plan" toggle swaps between chat and the week grid. Accept flow identical.

## Error Handling

- **Malformed tool call from model** → server retries once with an error message returned as tool result.
- **Anthropic API 5xx / rate limit** → surfaced in chat as a system message. Conversation stays `active`; no data loss.
- **Household API key missing/invalid** → hard error before opening drawer; directs user to settings.
- **Network drop mid-stream** → client reconnects via SSE with last-event-id; server replays from stored messages.
- **Accept-time DB error** → transaction rolls back; user sees a retry-friendly error; drafts still intact.

## Cost Controls

- Per-conversation hard caps: 50 messages, 10 `search_web` calls, 20 of any other tool call.
- Per-household daily cap: 20 meal-gen conversations (configurable). Beyond → polite error.
- Tokens per turn logged to `meal_gen_conversations.metadata` for later tuning.

## Auth & Permissions

- Only authenticated household members can create/read conversations for their household.
- RLS on `meal_gen_conversations` and `meal_gen_drafts` mirrors existing `household_id`-based pattern.
- `accepted_at` writes and draft promotion happen server-side only; clients cannot directly mutate `meal_gen_drafts` rows (API is sole writer apart from the model loop).
- Global `packet_sizes` rows (null `household_id`) are read-only for users; only migration / admin tooling writes them. Household overrides follow standard household RLS.

## Concurrency

- Two members generating plans for the same week concurrently: both allowed; each conversation owns its drafts independently.
- On accept, if existing `meal_plan_entries` occupy target slots: accept modal flags the conflict and requires explicit replace confirmation.

## Observability

- Structured logs per turn: `conversation_id`, `tool_calls`, `tokens_in`, `tokens_out`, `cache_hit_ratio`.
- Anthropic API errors surfaced to the project's error-tracking integration when it lands (not in this scope).

## Testing Strategy

### Unit (Vitest)

- **Packet rounding (`pack-round.ts`):** exact quantity ≥ pack → 1 pack; half-pack → 1 pack + waste annotation; no packet data → pass-through; multi-pack sizes → pick smallest that covers.
- **Draft-to-entry conversion:** each of the four `source` values lands in `meal_plan_entries` with correct columns populated.
- **Conversation message schema validation** (messages jsonb structure, tool call shape).

### Integration (Vitest + MSW for Anthropic)

- `/api/meal-plans/generate` endpoint with mocked Anthropic responses:
  - Model calls `propose_plan` → draft rows appear.
  - Model calls `scrape_and_save_recipe` → `recipes` table gets a row; duplicate URL returns existing id.
  - Cost cap: 11th `search_web` returns an error that the model sees in its tool result.
- Accept flow: drafts → `meal_plan_entries` transactional (either all or none); shopping list generated with packet rounding.

### E2E (Playwright, one happy path)

Open generator → send a message → fake streamed response materializes 5 draft entries in the grid → accept → week grid shows real entries + shopping list page shows generated list with packet annotations.

### LLM Evals (manual, offline)

- Fixture household: 5 members, 40 recipes, 10 staples, sample calendar events.
- 6 natural-language prompts covering the main flows.
- Assertions: ≥1 `propose_plan` call, entries cover requested slots, no duplicate recipes in 7-day window, `check_packet_sizes` called when ≥1 recipe selected.
- Run via `npm run eval:meal-gen`; results checked into `evals/meal-gen/runs/`.
- CI gating deferred.

## Rollout Plan

The spec is intentionally too large for a single implementation plan. It decomposes into four merge-sized chunks below; each chunk gets its own `docs/plans/` implementation plan written and executed in sequence. The first plan will be written immediately after this spec is approved.

Four merge-sized chunks, each deployable standalone:

1. **Foundation:** migrations (three tables + two columns on `meal_plan_entries`), RLS policies, `packet_sizes_uk.json` seed data, type regeneration.
2. **Server-side LLM loop:** `/api/meal-plans/generate*` endpoints, tool implementations, conversation persistence. Gated behind `MEAL_GEN_ENABLED` env flag (off in prod). Testable via curl / minimal scratch UI.
3. **Chat drawer UI + week grid draft rendering:** feature complete but still env-gated; internal staging only.
4. **Packet rounding + shopping preview + accept flow:** wires everything together. Flag flipped in staging → dogfood → production.

Each chunk: ~3–5 days focused work. Total: ~2–3 weeks iterative.

## File Layout

**New:**
- `supabase/migrations/00016_meal_gen.sql`
- `supabase/seed/packet_sizes_uk.json`
- `src/lib/ai/meal-plan/client.ts` — Anthropic client wrapper with cached system prompt
- `src/lib/ai/meal-plan/tools.ts` — tool implementations
- `src/lib/ai/meal-plan/conversation.ts` — conversation loop, streaming
- `src/lib/ai/meal-plan/prompt.ts` — system prompt + catalog index builder
- `src/lib/ai/meal-plan/types.ts`
- `src/lib/utils/pack-round.ts` — packet rounding utility
- `src/app/api/meal-plans/generate/route.ts`
- `src/app/api/meal-plans/generate/[id]/message/route.ts`
- `src/app/api/meal-plans/generate/[id]/route.ts`
- `src/app/api/meal-plans/generate/[id]/drafts/route.ts`
- `src/app/api/meal-plans/generate/[id]/draft/route.ts`
- `src/app/api/meal-plans/generate/[id]/accept/route.ts`
- `src/app/api/meal-plans/generate/[id]/discard/route.ts`
- `src/app/api/meal-plans/generate/recent/route.ts`
- `src/app/api/packet-sizes/route.ts`
- `src/app/api/packet-sizes/[id]/route.ts`
- `src/components/features/meal-plan/generate-drawer.tsx`
- `src/components/features/meal-plan/generate-chat.tsx`
- `src/components/features/meal-plan/generate-message.tsx`
- `src/components/features/meal-plan/draft-card.tsx`
- `src/components/features/meal-plan/shopping-preview.tsx`
- `src/components/features/meal-plan/accept-modal.tsx`
- `evals/meal-gen/fixtures/`
- `evals/meal-gen/run.ts`

**Modified:**
- `src/app/(dashboard)/meal-plans/page.tsx` — add Generate button
- `src/components/features/meal-plan/weekly-grid.tsx` — render draft overlay
- `src/lib/utils/shopping-aggregation.ts` — call pack-round after aggregation
- `src/types/meal-plans.ts` — add draft, conversation, packet-size types
- `CLAUDE.md` — note `src/lib/ai/meal-plan/` as new extraction-boundary module
