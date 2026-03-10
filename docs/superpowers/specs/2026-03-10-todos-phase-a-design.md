# Todos Phase A — List CRUD + Task Management

**Date:** 2026-03-10
**Status:** Approved
**Scope:** Phase A of Todos (Build Order Step 7). Phase B (subtasks, RRULE recurrence, "My Tasks" view) is a separate spec. Event-linked lists deferred until Calendar is built.

## Overview

Add todo list and task management. Users can create lists (general, checklist, project types), add tasks with priority/due dates/assignment, and manage them from a landing page with filters and pinned lists. Builds on existing `todo_lists` and `todo_items` tables already used by shopping lists.

## Data Model

### Migration: Add default_assigned_to + updated_at

Single migration adding two columns to `todo_lists`:

```sql
ALTER TABLE public.todo_lists ADD COLUMN default_assigned_to uuid;
ALTER TABLE public.todo_lists ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER todo_lists_updated_at
  BEFORE UPDATE ON public.todo_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
```

`default_assigned_to` is a bare UUID (no FK) — same pattern as `todo_items.assigned_to`. Both reference person IDs from the `household_persons` view, which includes managed members (kids) who don't have `profiles` rows. Validated at the application level.

`updated_at` added for consistency with other tables and to support sort-by-modified-date.

No new tables. All other fields already exist in `todo_lists` and `todo_items` from migration 00011.

### Field Usage

**todo_lists** (existing fields):

| Field | Usage |
|-------|-------|
| title | List name |
| list_type | 'general' / 'checklist' / 'project' (shopping handled separately) |
| color | Amalfi palette hex string, nullable (default null = no accent) |
| pinned | Boolean, pinned lists shown in dedicated section at top |
| archived | Boolean, archived lists hidden from default view |
| default_assigned_to | **(new)** Nullable UUID. New tasks auto-inherit this assignee. |
| created_by | Who created the list |

**todo_items** (existing fields used in Phase A):

| Field | Usage |
|-------|-------|
| title | Task name |
| description | Optional detail text |
| status | 'pending' / 'in_progress' / 'completed' |
| priority | 'none' / 'low' / 'medium' / 'high' / 'urgent' |
| due_date | Optional date |
| assigned_to | Nullable UUID, person from household_persons. Defaults to list's default_assigned_to on creation. |
| sort_order | Integer for manual ordering |
| completed_at | Auto-set when status changes to completed, cleared when uncompleted |
| created_by | Who created the task |

**Not used in Phase A:** `parent_item_id` (subtasks), `recurrence_rule` (RRULE), `quantity`/`unit`/`tags` (shopping-specific).

## Amalfi Coast Palette

8 preset colors for list accents:

| Name | Hex |
|------|-----|
| Terracotta | #E07A5F |
| Mediterranean | #4A90A4 |
| Lemon | #F2CC8F |
| Sage | #81B29A |
| Bougainvillea | #C97BB6 |
| Twilight | #3D405B |
| Peach | #E8A87C |
| Olive | #5B8C5A |

Used as left border accent on list cards and list detail header. Stored as hex string in `todo_lists.color`. Nullable — lists without a color get no accent border.

## Landing Page

### Layout
- **Header**: "Todos" title + list count + "+ New List" button
- **Filter chips**: All / General / Checklists / Projects / Archived. Filters the grid by `list_type`. "All" is default. "Archived" shows archived lists with an unarchive option.
- **Pinned section**: Lists with `pinned: true` shown first under "Pinned" heading
- **All Lists section**: Remaining non-pinned lists under "All Lists" heading
- **Grid**: 2 columns on desktop/tablet, 1 column on mobile
- **Empty state**: Friendly message with hint to create a list
- Only non-archived lists shown. Shopping lists (`list_type = 'shopping'`) excluded.

### List Cards
- Left border accent in the list's Amalfi color (or no border if null)
- Title, type badge + progress text ("3/8 done")
- Pin icon on pinned lists
- Summary hints: count of overdue tasks, high-priority tasks, tasks due today
- Fully completed lists show a checkmark
- Tap card → navigates to `/todos/[id]`

## List Detail View

### Header
- Back button (← to /todos)
- List color accent bar + title
- Subtitle: type + default assignee name (if set) + progress ("3/8 done")
- Overflow menu (⋯): Edit list, Pin/Unpin, Archive, Delete

### Quick Add
- Text input at top: "Add a task..."
- Enter creates task with just title. Inherits `default_assigned_to` from list and `priority: 'none'`.
- New tasks get `sort_order` at the end of the list.

### Task Rows (Minimal)
- Checkbox on left (toggles status between pending ↔ completed)
- Priority shown as colored left border:
  - Red `#ef4444`: high / urgent
  - Amber `#f59e0b`: medium
  - Blue `#3b82f6`: low
  - No border: none
- Title text in middle
- Right side badges (only shown when relevant):
  - Due date: red "overdue" / amber "today" / blue "tomorrow" / plain date for future
  - Assignee avatar: small circle with initial letter, colored using existing `member-colors.ts`
- Tap row → opens task edit dialog

### Completed Section
- Collapsed group at bottom: "Completed (N)" heading
- Strikethrough text, dimmed opacity
- Same checkbox to un-complete

### Task Edit Dialog
- Title (text input)
- Description (textarea, optional)
- Priority (select: none/low/medium/high/urgent)
- Due date (date input, optional)
- Assigned to (select from household persons, optional — "Unassigned" option)
- Delete button (with confirmation)

### List Edit Dialog / Create Dialog
- Title (text input)
- Type (select: general/checklist/project) — only on create, read-only after
- Color (Amalfi palette picker — 8 circles to click)
- Default assignee (select from household persons, optional)

## API Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | /api/todos?householdId=uuid | List all todo lists (non-shopping, non-archived) with item counts |
| POST | /api/todos | Create list |
| GET | /api/todos/[id] | Get list with all items (must be non-shopping) |
| PUT | /api/todos/[id] | Update list (title, color, pinned, archived, default_assigned_to) |
| DELETE | /api/todos/[id] | Delete list (cascade deletes items) |
| POST | /api/todos/[id]/items | Create task |
| PATCH | /api/todos/[id]/items/[itemId] | Update task (all fields — status, title, priority, due_date, etc.) |
| DELETE | /api/todos/[id]/items/[itemId] | Delete task |

All routes authenticate via Supabase session and enforce household membership via RLS.

**List type guard:** All per-list routes (`GET/PUT/DELETE /api/todos/[id]`, item routes) must verify the list's `list_type` is NOT `'shopping'`. This prevents accessing shopping lists through the todo API.

**GET /api/todos** returns lists with embedded `todo_items(id, status, priority, due_date)` and computes summary counts in JS (matching the shopping page pattern). Counts: total items, completed items, overdue count, high-priority count, due-today count.

**PATCH for status toggle:** When status changes to 'completed', set `completed_at = now()`. When changing away from completed, clear `completed_at = null`. PATCH handles both partial updates (checkbox toggle) and full updates (task edit dialog) — single endpoint, same as shopping pattern.

**POST /api/todos validation:** `title` (required, non-empty), `list_type` (must be general/checklist/project — not shopping), `household_id` (required). `color` must be a valid Amalfi hex if provided.

**Sort order for new tasks:** Query `MAX(sort_order)` for the list and add 1. Default to 0 if list is empty.

**Status toggle:** Checkbox toggles between `pending` and `completed` only. `in_progress` status is not exposed in Phase A UI.

**Optimistic updates:** Status toggles use optimistic UI (immediately reflect, revert on error) for responsive feel.

**Archive:** One-tap action, no confirmation (it's reversible). An "Archived" filter chip on the landing page allows viewing and unarchiving archived lists.

## Components

| File | Type | Purpose |
|------|------|---------|
| `src/app/(dashboard)/todos/page.tsx` | Server | Fetches lists with counts, renders todo-list-view |
| `src/app/(dashboard)/todos/[id]/page.tsx` | Server | Fetches list + items + household persons, renders todo-detail |
| `src/components/features/todos/todo-list-view.tsx` | Client | Landing: grid, filters, pinned section |
| `src/components/features/todos/todo-list-card.tsx` | Client | Single list card |
| `src/components/features/todos/todo-list-dialog.tsx` | Client | Create/edit list dialog |
| `src/components/features/todos/todo-detail.tsx` | Client | List detail: task rows, quick add, completed section, overflow menu |
| `src/components/features/todos/todo-item-row.tsx` | Client | Single task row with priority border, due badge, assignee |
| `src/components/features/todos/todo-item-dialog.tsx` | Client | Task edit dialog |
| `src/types/todos.ts` | Types | TodoList, TodoItem, Amalfi palette, priority colors |

## Types

```typescript
export interface TodoList {
  id: string
  household_id: string
  title: string
  list_type: 'general' | 'checklist' | 'project'
  color: string | null
  pinned: boolean
  archived: boolean
  default_assigned_to: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface TodoListWithCounts extends TodoList {
  total_items: number
  completed_items: number
  overdue_count: number
  high_priority_count: number
  due_today_count: number
}

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
  completed_at: string | null
  created_at: string
  updated_at: string
}

export const AMALFI_COLORS = [
  { name: 'Terracotta', hex: '#E07A5F' },
  { name: 'Mediterranean', hex: '#4A90A4' },
  { name: 'Lemon', hex: '#F2CC8F' },
  { name: 'Sage', hex: '#81B29A' },
  { name: 'Bougainvillea', hex: '#C97BB6' },
  { name: 'Twilight', hex: '#3D405B' },
  { name: 'Peach', hex: '#E8A87C' },
  { name: 'Olive', hex: '#5B8C5A' },
] as const

export const PRIORITY_COLORS = {
  urgent: '#ef4444',
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#3b82f6',
  none: null,
} as const

export const TODO_LIST_TYPES = ['general', 'checklist', 'project'] as const
```

## Out of Scope (Phase B)

- Subtask nesting via `parent_item_id` (project lists)
- RRULE recurrence for recurring tasks
- "My Tasks" aggregate view across all lists
- Event-linked lists (`event_id` on todo_lists — depends on Calendar)
- Drag-and-drop reordering (manual sort_order exists, but no drag UI in Phase A)
