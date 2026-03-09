# Meal Planning + Shopping Lists — Design

**Date:** 2026-03-09
**Status:** Approved

## Scope

### In This Phase

- Meal planning with full per-person assignment
- Weekly grid UI with navigation and copy-week
- Shopping list generation from meal plans (review draft → confirm)
- Unit conversion table for ingredient aggregation (metric ↔ imperial)
- Household staples (always-buy items auto-included in generated lists)
- Full `todo_lists` / `todo_items` schema (shopping uses a subset; rest ready for Todos phase)
- Manual shopping list items

### Deferred (Future Phases)

- **Meal generation v1** (Meal Planning enhancement) — Search-based recipe suggestions per slot: filter by tags, constraints, avoid recent repeats, prefer near-expiry inventory. Ranked suggestions.
- **Meal generation v2** (Meal Planning enhancement) — LLM-assisted via Claude API: receives recipes, members, constraints, natural language preferences, recent history. Returns proposed plan with reasoning. Shares same UI as v1 (parameter dialog → review/edit → confirm).
- **Real-time sync** (Todos phase) — Supabase Realtime subscriptions for live collaboration on shared lists.
- **Inventory subtraction** (Inventory phase) — Subtract current inventory from generated shopping lists.
- **Shopping → Inventory** (Inventory phase) — Bulk "add to inventory" action when items are checked off.
- **Calendar integration** (Calendar phase) — Meal plan entries surface as read-only events in calendar composite views.
- **Category grouping** (Shopping enhancement) — Auto-group shopping items by ingredient category (produce, dairy, meat, etc.).
- **Staples + inventory awareness** (Inventory phase) — Only include staples when inventory is low.

## Data Model

### `meal_plan_entries`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default `gen_random_uuid()` |
| household_id | uuid | FK → households, NOT NULL |
| date | date | NOT NULL |
| meal_type | text | CHECK: `breakfast` / `lunch` / `dinner` / `snack` |
| recipe_id | uuid | FK → recipes, nullable |
| custom_name | text | For non-recipe meals, nullable |
| servings | integer | NOT NULL, default 1 |
| assigned_to | uuid[] | Array of profile + managed_member IDs |
| created_by | uuid | FK → profiles |
| status | text | CHECK: `planned` / `cooked` / `skipped`, default `planned` |
| notes | text | Nullable |
| created_at | timestamptz | Default `now()` |
| updated_at | timestamptz | Default `now()` |

**Constraints:**
- CHECK: at least one of `recipe_id` or `custom_name` must be set
- No separate "meal plan" entity — query by household + date range
- `assigned_to` empty array = whole household

### `todo_lists`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default `gen_random_uuid()` |
| household_id | uuid | FK → households, NOT NULL |
| title | text | NOT NULL |
| event_id | uuid | FK → calendar_events, nullable (for Todos phase) |
| list_type | text | CHECK: `general` / `shopping` / `checklist` / `project` |
| created_by | uuid | FK → profiles |
| color | text | Nullable |
| pinned | boolean | Default false |
| archived | boolean | Default false |
| created_at | timestamptz | Default `now()` |

### `todo_items`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default `gen_random_uuid()` |
| list_id | uuid | FK → todo_lists, NOT NULL |
| title | text | NOT NULL |
| description | text | Nullable |
| status | text | CHECK: `pending` / `in_progress` / `completed`, default `pending` |
| priority | text | CHECK: `none` / `low` / `medium` / `high` / `urgent`, default `none` |
| due_date | date | Nullable |
| assigned_to | uuid | Single person ID, nullable |
| created_by | uuid | FK → profiles |
| sort_order | integer | For manual drag ordering |
| parent_item_id | uuid | FK → todo_items, nullable (subtasks) |
| recurrence_rule | text | RRULE, nullable |
| completed_at | timestamptz | Nullable |
| quantity | numeric | For shopping items, nullable |
| unit | text | For shopping items, nullable |
| tags | jsonb | Array of strings, nullable |
| created_at | timestamptz | Default `now()` |
| updated_at | timestamptz | Default `now()` |

### `household_staples`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default `gen_random_uuid()` |
| household_id | uuid | FK → households, NOT NULL |
| name | text | Normalized ingredient name, NOT NULL |
| default_quantity | numeric | Nullable |
| default_unit | text | Nullable |
| created_at | timestamptz | Default `now()` |

**RLS policies:** All three tables + staples use household_id-based RLS. Household members can CRUD entries for their household.

### Unit Conversion Table

Static lookup in `lib/utils/unit-conversion.ts` (not a database table). Handles:

- Volume: tsp ↔ tbsp ↔ cup ↔ ml ↔ L
- Weight: g ↔ kg ↔ oz ↔ lb
- Mismatched categories (volume vs weight) kept as separate line items

Used during shopping list generation to aggregate compatible units.

## API Routes

### Meal Plans

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/meal-plans?from=YYYY-MM-DD&to=YYYY-MM-DD` | List entries for date range |
| POST | `/api/meal-plans` | Create entry |
| PATCH | `/api/meal-plans/[id]` | Update entry |
| DELETE | `/api/meal-plans/[id]` | Delete entry |
| POST | `/api/meal-plans/copy-week` | Copy entries from source week to target week |

### Shopping

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/shopping/lists` | List all shopping lists for household |
| POST | `/api/shopping/lists` | Create empty shopping list |
| DELETE | `/api/shopping/lists/[id]` | Delete list |
| POST | `/api/shopping/generate` | Generate aggregated draft from meal plan date range (not persisted) |
| POST | `/api/shopping/lists/[id]/items` | Add item(s) to list (confirm draft or manual add) |
| PATCH | `/api/shopping/lists/[id]/items/[itemId]` | Update item (status, quantity, etc.) |
| DELETE | `/api/shopping/lists/[id]/items/[itemId]` | Remove item |

### Household Staples

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/households/[id]/staples` | List staples |
| POST | `/api/households/[id]/staples` | Add staple |
| PATCH | `/api/households/[id]/staples/[stapleId]` | Update staple |
| DELETE | `/api/households/[id]/staples/[stapleId]` | Remove staple |

### Shopping Generation Flow

1. Client calls `POST /api/shopping/generate` with `{ from, to }`
2. Server queries `meal_plan_entries` for date range → joins `recipe_ingredients` → scales by servings → aggregates by normalized name with unit conversion → merges household staples → returns draft
3. Client renders draft for review (edit quantities, remove items, add manual items)
4. Client confirms: `POST /api/shopping/lists` → `POST /api/shopping/lists/[id]/items` (bulk add)

## UI Design

### Weekly Grid (Meal Plans Page)

**Header:** Week of [date] with left/right arrows, "Today" button, "Copy Week" button.

**Desktop:** 7 columns (Mon–Sun) × 4 rows (Breakfast, Lunch, Dinner, Snack). Each cell shows meal entry cards with recipe/custom name and person avatars for assignments.

**Mobile:** Stacked day view (accordion or swipeable) rather than 7-column grid.

**Cell interactions:**
- Click "+" in a cell → add dialog
- Click a card → edit dialog
- Drag cards to move between slots
- Delete button to remove

**Add/Edit Meal Dialog:**
- Two tabs: "From Recipe" (search/browse household recipes) and "Custom" (free text name)
- Servings input
- Member multi-select for person assignment (profiles + managed members), defaults to whole household
- Notes field
- Status selector (planned / cooked / skipped)

**Copy Week:** Button opens dialog to pick source week → duplicates all entries to current week.

### Shopping Lists Page

**List view:** All shopping lists for household, most recent first. Each shows title, item count, completion progress.

**Generate button:** "Generate from Meal Plan" → date range picker → review draft.

**Draft review screen:**
- Aggregated ingredient list with quantities and units
- Household staples included (marked as staples)
- Checkboxes to include/exclude each item
- Edit quantities inline
- Add manual items
- "Create List" button to confirm

**Shopping list view:**
- Checklist UI — tap to check off items
- Manual reordering via sort_order
- "Add Item" button for manual additions
- Checked items move to bottom or separate section

**Staples management:** Accessible from shopping page or household settings. Simple CRUD list of name + default quantity + unit.

## Testing Strategy

### Unit Tests (Vitest)

- Unit conversion table — all conversion paths produce correct results
- Ingredient aggregation logic — same-unit summing, cross-unit conversion, mismatched units kept separate
- Scaling calculations — servings multiplier applied correctly
- Staples merging into draft

### Integration Tests (Vitest + React Testing Library)

- Meal plan CRUD API routes
- Shopping list generation endpoint (mock meal plan entries → correct aggregated draft)
- Shopping list CRUD API routes
- Staples CRUD API routes
- Weekly grid component — renders entries, handles add/edit/delete
- Copy week flow

### E2E Tests (Playwright)

- Full flow: create meal plan entries → generate shopping list → review draft → confirm → check off items
- Week navigation and copy week
- Per-person assignment
- Staples management and inclusion in generated lists
