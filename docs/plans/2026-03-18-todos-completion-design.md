# Todos Completion — Design

**Date:** 2026-03-18
**Status:** Approved

## Scope

### In This Phase

- Event-linked todo lists (attach list to calendar event, progress badge, inline display)
- My Tasks view (cross-list personal view inside Todos page)
- Reusable list templates (save as template, create from template)
- Item groups (group_name field, collapsible sections vs. tabs toggle)

### Deferred

- **Recurring tasks** — RRULE-based recurrence in UI (schema exists, deferred for low day-to-day value vs. complexity)
- **Real-time sync** — Supabase Realtime subscriptions for live collaboration on shared lists

## Schema Changes

### `todo_lists` — Two New Columns

| Column | Type | Notes |
|--------|------|-------|
| `is_template` | boolean | Default `false`. Templates excluded from normal list views |
| `event_id` | uuid | FK → `calendar_events`, nullable. Links list to a calendar event |

**Constraints:**
- Templates (`is_template = true`) cannot have `event_id` set
- One list per event (unique constraint on `event_id` where not null)
- RLS unchanged — same household isolation policy applies
- Templates are household-scoped, not personal

### `todo_items` — One New Column

| Column | Type | Notes |
|--------|------|-------|
| `group_name` | text | Nullable. Items with same group_name render together. Ungrouped items go in default section |

## Feature 1: Event-Linked Lists

### Linking Flow

When creating or editing a calendar event, an "Attach list" control appears with three options:

1. **Create new list** — creates a blank list linked to the event
2. **From template** — clones a template into a new list and links it to the event
3. **Attach existing list** — links an existing unlinked list to the event

One event → one linked list. If multiple lists are needed, use a project list with subtask grouping or item groups.

### Calendar Display

- Events with a linked list show a small progress badge (e.g., "3/7") on the event pill in week and month views
- The event detail dialog shows the full linked list inline, reusing the existing `todo-detail` component

### Detach and Delete Behavior

- **Detach:** Unlinks the list from the event. List becomes standalone. Does not delete the list.
- **Delete event:** Does NOT delete the linked list. List becomes standalone.
- **Delete list:** The list is deleted. The calendar event is unaffected — there is no back-reference to clean up.

## Feature 2: My Tasks View

### Purpose

A cross-list view showing everything assigned to the current user across all non-shopping, non-template lists in the household.

### Access

Toggle inside the Todos page header: **Lists** (default, current list-of-lists behavior) vs. **My Tasks** (personal cross-list view).

### Data Query

All `todo_items` where:
- `assigned_to` = current user
- Parent `todo_list.list_type` is not `shopping`
- Parent `todo_list.is_template` is `false`
- Parent `todo_list.archived` is `false`
- `status` != `completed` (by default; filter can show completed)

### Sorting

Items grouped by time bucket:
1. **Overdue** — due date in the past
2. **Due today**
3. **Due this week**
4. **Due later**
5. **No due date**

Within each bucket, sorted by priority: urgent → high → medium → low → none.

### Display

- Each time bucket is a collapsible section with item count ("Overdue (2)")
- Each item row shows: title, list name (subtle label), priority badge, due date
- Clicking an item opens the existing `todo-item-dialog`
- Clicking the list name navigates to the full list

### Filters

- Filter by: list, priority, status
- Filters stored in URL params for shareability
- No saved/named filters

## Feature 3: Reusable Templates

### Saving a Template

- Any list can be saved as a template via "Save as template" action in the list's menu
- Server-side clone: copies the list + all items (including `group_name`) into a new list with `is_template = true`
- Template gets the same title; user can rename
- Original list is unaffected

### Managing Templates

- Templates section at the bottom of the Lists view, visually separated
- Templates are editable like any list — add, remove, reorder items, update groups
- Delete a template via its menu

### Using a Template

- "New list from template" option when creating a new list (alongside creating a blank list)
- Also available from the event-linking flow ("From template" option)
- Clones template items (including `group_name`) into a new working list
- User names the new list, optionally attaches to an event
- Changes to a template do not affect lists already created from it

## Feature 4: Item Groups

### Data Model

`group_name` text field on `todo_items`. Nullable. Items with the same `group_name` within a list render together. Ungrouped items (null `group_name`) go in a default section.

### Display Toggle

Per-list UI toggle in the list header:
- **Sections** (default) — collapsible vertical sections, all visible, can fold individually
- **Tabs** — horizontal tabs, click to switch between groups

Display preference persisted in `localStorage` keyed by list ID. When no items have a `group_name`, the toggle is hidden and items render flat as today.

### Interaction

- User sets `group_name` when adding or editing an item
- Drag items between groups
- Group display order determined by the minimum `sort_order` among items in each group
- Applies to all non-shopping list types (general, checklist, project)

## API Endpoints

### New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/todos/my-tasks` | My Tasks query with filters |
| POST | `/api/todos/[id]/clone` | Clone a list. Body: `{ title?: string, is_template?: boolean, event_id?: uuid }`. Used for both "Save as template" (`is_template: true`) and "Use template" (`is_template: false`, optional `event_id`) |

### Modified Endpoints

| Method | Path | Change |
|--------|------|--------|
| GET | `/api/todos` | Exclude templates by default. Add `?templates=true` to list templates only |
| POST | `/api/todos` | Accept `is_template`, `event_id` fields |
| PATCH | `/api/todos/[id]` | Accept `event_id` for linking/unlinking |
| POST | `/api/todos/[id]/items` | Accept `group_name` field |
| PATCH | `/api/todos/[id]/items/[itemId]` | Accept `group_name` field |

### Calendar Endpoint Changes

| Method | Path | Change |
|--------|------|--------|
| GET | `/api/calendar` | Include linked list progress (item count, completed count) in event response |

## Component Changes

### New Components

| Component | Purpose |
|-----------|---------|
| `my-tasks-view.tsx` | My Tasks cross-list view |
| `my-tasks-item-row.tsx` | Item row with list name label |
| `template-section.tsx` | Templates section at bottom of Lists view |
| `attach-list-control.tsx` | Event dialog control for linking lists |
| `group-tabs.tsx` | Tabbed group view |
| `group-sections.tsx` | Collapsible sections group view |
| `view-toggle.tsx` | Sections/Tabs toggle |

### Modified Components

| Component | Change |
|-----------|--------|
| `todo-list-view.tsx` | Add Lists/My Tasks toggle. Add templates section at bottom |
| `todo-detail.tsx` | Support group rendering (tabs or sections). Pass through group_name on items |
| `todo-item-dialog.tsx` | Add group_name field |
| `todo-item-row.tsx` | Display group context when needed |
| `todo-list-dialog.tsx` | Add "From template" option |
| `event-dialog.tsx` | Add attach-list control |
| `event-pill.tsx` | Show progress badge |
| `event-block.tsx` | Show progress badge |

## Migration

Single migration file: `00015_todos_completion.sql`

```sql
-- Add template and event linking to todo_lists
ALTER TABLE todo_lists ADD COLUMN is_template boolean NOT NULL DEFAULT false;
ALTER TABLE todo_lists ADD COLUMN event_id uuid REFERENCES calendar_events(id) ON DELETE SET NULL;

-- One list per event
CREATE UNIQUE INDEX idx_todo_lists_event_id ON todo_lists (event_id) WHERE event_id IS NOT NULL;

-- Templates cannot be linked to events
ALTER TABLE todo_lists ADD CONSTRAINT chk_template_no_event
  CHECK (NOT (is_template = true AND event_id IS NOT NULL));

-- Add group_name to todo_items
ALTER TABLE todo_items ADD COLUMN group_name text;

-- Index for My Tasks query
CREATE INDEX idx_todo_items_assigned_to ON todo_items (assigned_to) WHERE status != 'completed';
```

## Seed Data

Add to `supabase/seed.sql`:
- 2 template lists (one packing template with groups "Clothes"/"Toiletries"/"Electronics", one weekly chores template)
- 1 event-linked list (linked to an existing calendar event)
- Items across lists with various `group_name` values
