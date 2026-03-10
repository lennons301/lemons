# Inventory Phase A — Core CRUD + Shopping → Inventory

**Date:** 2026-03-10
**Status:** Approved
**Scope:** Phase A of Inventory (Build Order Step 5). Phase B (cooking deduction, leftovers, expiry dashboard) is a separate spec.

## Overview

Add inventory management to the household platform. Users can track what food they have, where it's stored, and when it expires. Completed shopping list items can be bulk-transferred into inventory with remembered location/category defaults.

## Data Model

### inventory_items

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| household_id | uuid | FK → households, RLS |
| created_by | uuid | FK → profiles, NOT NULL |
| name | text | Normalized ("onion") |
| display_name | text | User-facing ("Large red onions") |
| quantity | numeric | |
| unit | text | Nullable |
| location | text NOT NULL | CHECK (location IN ('fridge', 'freezer', 'pantry', 'cupboard', 'other')) |
| category | text | produce / dairy / meat / fish / grain / tinned / spice / condiment / other. Nullable. |
| expiry_date | date | Optional |
| added_from | text NOT NULL | DEFAULT 'manual', CHECK (added_from IN ('manual', 'shopping_list')) |
| notes | text | Optional |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**Indexes:** `idx_inventory_items_household` on (household_id), `idx_inventory_items_household_name_location` on (household_id, name, location) for duplicate detection in bulk endpoint.

RLS: Same pattern as all other household tables — SELECT/INSERT/UPDATE/DELETE restricted to members of the household.

### inventory_defaults

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| household_id | uuid | FK → households, RLS |
| normalized_name | text | |
| location | text | |
| category | text | Nullable |

UNIQUE constraint on (household_id, normalized_name). Upserted whenever a user saves an inventory item. Used to pre-fill location/category when transferring shopping items to inventory.

**Indexes:** `idx_inventory_defaults_household` on (household_id). The UNIQUE constraint also creates an implicit index on (household_id, normalized_name).

RLS: Same household pattern.

## Inventory List View

### Layout
- Grouped by **location** (default) or **category** (toggle via segmented control in header)
- Section headers: icon + location name + item count + "Quick add" link
- Locations: Fridge, Freezer, Pantry, Cupboard, Other
- Empty locations are hidden (no empty sections)
- Search bar filters on `display_name` (with fallback to `name`) across all locations in real-time

### Item Rows
- Minimal: name, quantity+unit, inline +/- buttons
- Expiry badge shown only when within 3 days:
  - Red: expires today or tomorrow
  - Amber: expires in 2-3 days
  - Hidden otherwise
- Tap row → opens full edit dialog

### Adding Items
- **Quick add** (per location section): text input, auto-sets location to that section. Creates item with just name + location.
- **"+ Add Item" button** (header): opens full dialog with all fields (name, display_name, quantity, unit, location, category, expiry_date, notes)
- Both paths upsert `inventory_defaults` with the item's normalized name, location, and category

### Editing Items
- Full edit dialog with all fields
- +/- buttons for inline quantity adjustment (increment/decrement by 1). Uses optimistic updates for responsiveness.
- Delete with confirmation

### Empty State
- Friendly message with hint to add items manually or via shopping list

## Shopping → Inventory Flow

### Step 1: Button on Shopping List
- "Add N items to Inventory" button appears at the bottom of the shopping list detail view when ≥1 item is checked off
- N = count of completed items
- Button is not shown when no items are completed

### Step 2: Review Screen (Dialog)
- Shows each completed shopping item with:
  - Name and quantity+unit (carried from shopping item)
  - Location pill — pre-filled from `inventory_defaults` if found, otherwise dashed "Select location..." prompt
  - Category pill — pre-filled from defaults, otherwise dashed "category..." prompt (optional)
- Items without saved defaults show a "NEW" badge
- Tapping a pill opens a dropdown to select location or category
- Location is required for every item; category is optional

**Field mapping from shopping items:** Shopping items are `todo_items` with a `title` field. The mapping is:
- `todo_items.title` → `inventory_items.display_name`
- `inventory_items.name` derived by running title through `normalizeName()` from `src/lib/utils/ingredients.ts`
- `todo_items.quantity` and `todo_items.unit` map directly

### Step 3: Confirm
- Creates `inventory_items` for each item (added_from = 'shopping_list')
- **Duplicate handling:** If an item with the same normalized name + location already exists AND has a compatible unit, increment its quantity. If units differ (e.g., existing "500 g" vs incoming "2 bags"), create a new row rather than attempting conversion. If existing quantity is NULL, replace it with the incoming quantity.
- Upserts `inventory_defaults` for each item
- Success toast shown
- Button changes to "Added to Inventory" (disabled) to prevent double-add

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/inventory?householdId=uuid | List all inventory items for household |
| POST | /api/inventory | Create single item (manual add) |
| PUT | /api/inventory/[id] | Full update (edit dialog) |
| PATCH | /api/inventory/[id] | Partial update (+/- quantity) |
| DELETE | /api/inventory/[id] | Delete item |
| POST | /api/inventory/bulk | Bulk create from shopping (review confirm). Handles duplicate merging + defaults upsert. Transactional — all or nothing. |
| GET | /api/inventory/defaults | Fetch defaults for a list of normalized names (query param) |

All routes authenticate via Supabase session and enforce household membership.

## Components

| File | Type | Purpose |
|------|------|---------|
| `src/app/(dashboard)/inventory/page.tsx` | Server | Fetches items, renders inventory-list |
| `src/components/features/inventory/inventory-list.tsx` | Client | Main list: grouping, search, toggle, state |
| `src/components/features/inventory/inventory-item-row.tsx` | Client | Single row: name, qty, +/-, expiry badge |
| `src/components/features/inventory/inventory-item-dialog.tsx` | Client | Full add/edit dialog |
| `src/components/features/inventory/add-to-inventory-button.tsx` | Client | Button on shopping list detail |
| `src/components/features/inventory/add-to-inventory-review.tsx` | Client | Review dialog with location/category assignment |

## Database Migration

Single migration creating both tables with:
- Standard UUID PKs with gen_random_uuid()
- Foreign keys to households
- RLS policies (SELECT/INSERT/UPDATE/DELETE for household members)
- UNIQUE constraint on inventory_defaults(household_id, normalized_name)
- Trigger `inventory_items_updated_at` using existing `update_updated_at()` function from migration 00003

## Out of Scope (Phase B)

- `is_cooked_meal`, `source_recipe_id`, `cooked_servings` columns
- Cooking → Inventory smart deduction
- Leftovers → Meal plan flow
- Expiry dashboard widget
- Meal plan generation prioritizing near-expiry items
