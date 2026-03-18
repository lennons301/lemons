# Todos Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Todos phase — event-linked lists, My Tasks view, reusable templates, and item groups.

**Architecture:** Extends the existing `todo_lists`/`todo_items` schema with 3 new columns. No new tables. All new UI components follow existing patterns (client components with fetch-based state management, server component pages for initial data). Calendar components are extended to show linked list progress.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + RLS), React, Tailwind CSS, shadcn/ui, @dnd-kit, sonner (toasts)

**Spec:** `docs/plans/2026-03-18-todos-completion-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `supabase/migrations/00015_todos_completion.sql` | Schema migration (3 columns, constraints, indexes) |
| `src/app/api/todos/[id]/clone/route.ts` | Clone endpoint for templates |
| `src/app/api/todos/my-tasks/route.ts` | My Tasks query endpoint |
| `src/components/features/todos/my-tasks-view.tsx` | My Tasks cross-list view |
| `src/components/features/todos/my-tasks-item-row.tsx` | Item row with list name label for My Tasks |
| `src/components/features/todos/template-section.tsx` | Templates section at bottom of Lists view |
| `src/components/features/todos/group-sections.tsx` | Collapsible sections group view |
| `src/components/features/todos/group-tabs.tsx` | Tabbed group view |
| `src/components/features/todos/group-view-toggle.tsx` | Sections/Tabs toggle button |
| `src/components/features/calendar/attach-list-control.tsx` | Event dialog control for linking todo lists |

### Modified Files
| File | Changes |
|------|---------|
| `src/types/todos.ts` | Add `is_template`, `event_id`, `group_name` to interfaces |
| `src/app/api/todos/route.ts` | Exclude templates by default, add `?templates=true` filter, accept `is_template`/`event_id` on POST |
| `src/app/api/todos/[id]/route.ts` | Accept `event_id` on PUT for linking/unlinking |
| `src/app/api/todos/[id]/items/route.ts` | Accept `group_name` on POST |
| `src/app/api/todos/[id]/items/[itemId]/route.ts` | Accept `group_name` on PATCH |
| `src/app/api/calendar/route.ts` | Include linked list progress in event response |
| `src/app/(dashboard)/todos/page.tsx` | Pass templates + view mode to component |
| `src/components/features/todos/todo-list-view.tsx` | Add Lists/My Tasks toggle, templates section, "from template" create option |
| `src/components/features/todos/todo-detail.tsx` | Support group rendering, "Save as template" menu item |
| `src/components/features/todos/todo-item-dialog.tsx` | Add group_name field |
| `src/components/features/todos/todo-list-dialog.tsx` | Add "From template" option when creating |
| `src/components/features/calendar/event-dialog.tsx` | Add attach-list control |
| `src/components/features/calendar/event-pill.tsx` | Show progress badge |
| `src/components/features/calendar/event-block.tsx` | Show progress badge |
| `src/components/features/calendar/calendar-view.tsx` | Fetch/pass linked list data with events |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00015_todos_completion.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 00015_todos_completion.sql
-- Adds: is_template + event_id to todo_lists, group_name to todo_items

-- Template flag
ALTER TABLE todo_lists ADD COLUMN is_template boolean NOT NULL DEFAULT false;

-- Event linking
ALTER TABLE todo_lists ADD COLUMN event_id uuid REFERENCES calendar_events(id) ON DELETE SET NULL;

-- One list per event
CREATE UNIQUE INDEX idx_todo_lists_event_id ON todo_lists (event_id) WHERE event_id IS NOT NULL;

-- Templates cannot be linked to events
ALTER TABLE todo_lists ADD CONSTRAINT chk_template_no_event
  CHECK (NOT (is_template = true AND event_id IS NOT NULL));

-- Item groups
ALTER TABLE todo_items ADD COLUMN group_name text;

-- Index for My Tasks query (assigned_to on pending items)
CREATE INDEX idx_todo_items_assigned_to ON todo_items (assigned_to) WHERE status != 'completed';
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db push` (or `supabase migration up` if local Supabase is running)

If local Docker is not available, this will be verified on staging via Vercel preview deploy.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00015_todos_completion.sql
git commit -m "feat: add migration for todos completion (templates, event linking, groups)"
```

---

## Task 2: Update Types

**Files:**
- Modify: `src/types/todos.ts`

- [ ] **Step 1: Add new fields to TodoList interface**

Add after `updated_at` in the `TodoList` interface:

```typescript
  is_template: boolean
  event_id: string | null
```

- [ ] **Step 2: Add group_name to TodoItem interface**

Add after `sort_order` in the `TodoItem` interface:

```typescript
  group_name: string | null
```

- [ ] **Step 3: Add MyTaskItem type**

Add at the end of the file:

```typescript
export interface MyTaskItem extends TodoItem {
  list_title: string
  list_id: string
  list_color: string | null
}
```

- [ ] **Step 4: Commit**

```bash
git add src/types/todos.ts
git commit -m "feat: add template, event_id, group_name types to todos"
```

---

## Task 3: API — Template Filtering and Creation

**Files:**
- Modify: `src/app/api/todos/route.ts`

- [ ] **Step 1: Update GET to exclude templates by default and support `?templates=true`**

In the GET handler, after the `showArchived` line, add template filtering:

```typescript
  const showTemplates = url.searchParams.get('templates') === 'true'
```

After the `.neq('list_type', 'shopping')` line, add:

```typescript
    .eq('is_template', showTemplates)
```

This ensures normal list views never see templates, and `?templates=true` returns only templates.

- [ ] **Step 2: Update POST to accept `is_template` and `event_id`**

In the POST handler, destructure the new fields:

```typescript
  const { household_id, title, list_type, color, default_assigned_to, is_template, event_id } = body
```

Add to the insert object:

```typescript
      is_template: is_template ?? false,
      event_id: event_id ?? null,
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/todos/route.ts
git commit -m "feat: filter templates from todo list queries, accept template/event fields on create"
```

---

## Task 4: API — Event Linking on Update

**Files:**
- Modify: `src/app/api/todos/[id]/route.ts`

- [ ] **Step 1: Accept `event_id` in PUT handler**

In the PUT handler, after the `if ('default_assigned_to' in body)` block, add:

```typescript
  if ('event_id' in body) updates.event_id = body.event_id ?? null
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/todos/[id]/route.ts
git commit -m "feat: accept event_id on todo list update for linking/unlinking"
```

---

## Task 5: API — Group Name on Items

**Files:**
- Modify: `src/app/api/todos/[id]/items/route.ts`
- Modify: `src/app/api/todos/[id]/items/[itemId]/route.ts`

- [ ] **Step 1: Accept group_name on item creation**

In `src/app/api/todos/[id]/items/route.ts`, in the POST handler's insert object, add:

```typescript
      group_name: body.group_name ?? null,
```

- [ ] **Step 2: Accept group_name on item update**

In `src/app/api/todos/[id]/items/[itemId]/route.ts`, in the PATCH handler, add after existing field checks:

```typescript
  if ('group_name' in body) updates.group_name = body.group_name ?? null
```

(You'll need to read this file first to see the exact pattern — it uses an `updates` object like the list PUT handler.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/todos/[id]/items/route.ts src/app/api/todos/[id]/items/[itemId]/route.ts
git commit -m "feat: accept group_name on todo item create and update"
```

---

## Task 6: API — Clone Endpoint

**Files:**
- Create: `src/app/api/todos/[id]/clone/route.ts`

- [ ] **Step 1: Implement the clone endpoint**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch source list with items
  const { data: source, error: fetchError } = await supabase
    .from('todo_lists')
    .select(`*, todo_items(*)`)
    .eq('id', id)
    .neq('list_type', 'shopping')
    .order('sort_order', { referencedTable: 'todo_items', ascending: true })
    .single()

  if (fetchError || !source) {
    return NextResponse.json({ error: 'List not found' }, { status: 404 })
  }

  const body = await request.json()
  const { title, is_template, event_id } = body

  // Create the cloned list
  const { data: clonedList, error: listError } = await supabase
    .from('todo_lists')
    .insert({
      household_id: source.household_id,
      title: title?.trim() || source.title,
      list_type: source.list_type,
      color: source.color,
      default_assigned_to: source.default_assigned_to,
      is_template: is_template ?? false,
      event_id: event_id ?? null,
      created_by: user.id,
    })
    .select()
    .single()

  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })

  // Clone items
  const sourceItems = source.todo_items || []
  if (sourceItems.length > 0) {
    const clonedItems = sourceItems.map((item: any, idx: number) => ({
      list_id: clonedList.id,
      title: item.title,
      description: item.description,
      priority: item.priority,
      group_name: item.group_name,
      sort_order: idx,
      status: 'pending',
      created_by: user.id,
    }))

    const { error: itemsError } = await supabase
      .from('todo_items')
      .insert(clonedItems)

    if (itemsError) {
      // Clean up the list if items failed
      await supabase.from('todo_lists').delete().eq('id', clonedList.id)
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }
  }

  // Return the full cloned list with items
  const { data: result } = await supabase
    .from('todo_lists')
    .select(`*, todo_items(*)`)
    .eq('id', clonedList.id)
    .order('sort_order', { referencedTable: 'todo_items', ascending: true })
    .single()

  return NextResponse.json(result, { status: 201 })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/todos/[id]/clone/route.ts
git commit -m "feat: add clone endpoint for todo list templates"
```

---

## Task 7: API — My Tasks Endpoint

**Files:**
- Create: `src/app/api/todos/my-tasks/route.ts`

- [ ] **Step 1: Implement the My Tasks query**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const householdId = url.searchParams.get('householdId')
  const showCompleted = url.searchParams.get('completed') === 'true'
  const filterList = url.searchParams.get('listId')
  const filterPriority = url.searchParams.get('priority')

  if (!householdId) return NextResponse.json({ error: 'householdId is required' }, { status: 400 })

  // Get user's person ID (could be profile or managed member)
  // First check household_members for the auth user
  const { data: member } = await supabase
    .from('household_members')
    .select('id, profile_id')
    .eq('household_id', householdId)
    .eq('profile_id', user.id)
    .single()

  if (!member) return NextResponse.json({ error: 'Not a member of this household' }, { status: 403 })

  // Query items assigned to this user across all non-shopping, non-template, non-archived lists
  // Note: assigned_to stores person IDs (from household_persons view), not auth UIDs
  let query = supabase
    .from('todo_items')
    .select(`
      *,
      todo_lists!inner(id, title, list_type, color, is_template, archived)
    `)
    .eq('assigned_to', member.id)
    .eq('todo_lists.is_template', false)
    .eq('todo_lists.archived', false)
    .neq('todo_lists.list_type', 'shopping')
    .eq('todo_lists.household_id', householdId)

  if (!showCompleted) {
    query = query.neq('status', 'completed')
  }
  if (filterList) {
    query = query.eq('list_id', filterList)
  }
  if (filterPriority) {
    query = query.eq('priority', filterPriority)
  }

  const { data, error } = await query.order('due_date', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Transform to include list info at top level
  const items = (data || []).map((item: any) => ({
    ...item,
    list_title: item.todo_lists.title,
    list_color: item.todo_lists.color,
    list_id: item.todo_lists.id,
    todo_lists: undefined,
  }))

  return NextResponse.json(items)
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/todos/my-tasks/route.ts
git commit -m "feat: add My Tasks API endpoint"
```

---

## Task 8: API — Calendar Events with Linked List Progress

**Files:**
- Modify: `src/app/api/calendar/route.ts`

- [ ] **Step 1: Extend GET to include linked list progress**

Replace the select in the GET handler:

```typescript
  const { data, error } = await supabase
    .from('calendar_events')
    .select(`
      *,
      todo_lists!todo_lists_event_id_fkey(
        id,
        title,
        todo_items(id, status)
      )
    `)
    .eq('household_id', householdId)
    .lt('start_datetime', end)
    .gt('end_datetime', start)
    .order('start_datetime', { ascending: true })
```

After the query, transform the data to flatten list progress:

```typescript
  const events = (data || []).map((event: any) => {
    const linkedList = event.todo_lists?.[0] ?? null
    let list_progress = null
    if (linkedList) {
      const items = linkedList.todo_items || []
      const completed = items.filter((i: any) => i.status === 'completed').length
      list_progress = { list_id: linkedList.id, total: items.length, completed }
    }
    return { ...event, todo_lists: undefined, list_progress }
  })

  return NextResponse.json(events)
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/calendar/route.ts
git commit -m "feat: include linked todo list progress in calendar event responses"
```

---

## Task 9: Item Groups — Group View Components

**Files:**
- Create: `src/components/features/todos/group-view-toggle.tsx`
- Create: `src/components/features/todos/group-sections.tsx`
- Create: `src/components/features/todos/group-tabs.tsx`

- [ ] **Step 1: Create the view toggle component**

```typescript
// src/components/features/todos/group-view-toggle.tsx
'use client'

import { LayoutList, LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface GroupViewToggleProps {
  mode: 'sections' | 'tabs'
  onToggle: (mode: 'sections' | 'tabs') => void
}

export function GroupViewToggle({ mode, onToggle }: GroupViewToggleProps) {
  return (
    <div className="flex gap-0.5 border rounded-md p-0.5">
      <Button
        variant={mode === 'sections' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-6 px-2"
        onClick={() => onToggle('sections')}
        title="Sections view"
      >
        <LayoutList className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant={mode === 'tabs' ? 'secondary' : 'ghost'}
        size="sm"
        className="h-6 px-2"
        onClick={() => onToggle('tabs')}
        title="Tabs view"
      >
        <LayoutGrid className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
```

- [ ] **Step 2: Create the collapsible sections component**

```typescript
// src/components/features/todos/group-sections.tsx
'use client'

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { TodoItemRow } from './todo-item-row'
import type { TodoItem } from '@/types/todos'
import type { Person } from '@/types/person'

interface GroupSectionsProps {
  items: TodoItem[]
  persons: Person[]
  onToggle: (item: TodoItem) => void
  onClick: (item: TodoItem) => void
  onDragEnd: (event: DragEndEvent) => void
}

function groupItems(items: TodoItem[]): { name: string | null; items: TodoItem[] }[] {
  const groups = new Map<string | null, TodoItem[]>()
  for (const item of items) {
    const key = item.group_name
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  // Sort groups by minimum sort_order of their items
  return Array.from(groups.entries())
    .sort(([, a], [, b]) => (a[0]?.sort_order ?? 0) - (b[0]?.sort_order ?? 0))
    .map(([name, items]) => ({ name, items }))
}

export function GroupSections({ items, persons, onToggle, onClick, onDragEnd }: GroupSectionsProps) {
  const groups = groupItems(items)
  const [collapsed, setCollapsed] = useState<Set<string | null>>(new Set())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const toggleCollapse = (groupName: string | null) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(groupName)) next.delete(groupName)
      else next.add(groupName)
      return next
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      modifiers={[restrictToVerticalAxis]}
    >
      <div className="space-y-3">
        {groups.map((group) => {
          const label = group.name ?? 'Ungrouped'
          const isCollapsed = collapsed.has(group.name)
          return (
            <div key={group.name ?? '__ungrouped'}>
              <button
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 hover:text-foreground"
                onClick={() => toggleCollapse(group.name)}
              >
                {isCollapsed ? '▸' : '▾'} {label} ({group.items.length})
              </button>
              {!isCollapsed && (
                <SortableContext
                  items={group.items.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="border rounded-lg overflow-hidden">
                    {group.items.map((item) => (
                      <TodoItemRow
                        key={item.id}
                        item={item}
                        persons={persons}
                        onToggle={onToggle}
                        onClick={onClick}
                      />
                    ))}
                  </div>
                </SortableContext>
              )}
            </div>
          )
        })}
      </div>
    </DndContext>
  )
}
```

- [ ] **Step 3: Create the tabs component**

```typescript
// src/components/features/todos/group-tabs.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { TodoItemRow } from './todo-item-row'
import type { TodoItem } from '@/types/todos'
import type { Person } from '@/types/person'

interface GroupTabsProps {
  items: TodoItem[]
  persons: Person[]
  onToggle: (item: TodoItem) => void
  onClick: (item: TodoItem) => void
  onDragEnd: (event: DragEndEvent) => void
}

function getGroupNames(items: TodoItem[]): (string | null)[] {
  const seen = new Map<string | null, number>()
  for (const item of items) {
    if (!seen.has(item.group_name)) {
      seen.set(item.group_name, item.sort_order)
    } else {
      seen.set(item.group_name, Math.min(seen.get(item.group_name)!, item.sort_order))
    }
  }
  return Array.from(seen.entries())
    .sort(([, a], [, b]) => a - b)
    .map(([name]) => name)
}

export function GroupTabs({ items, persons, onToggle, onClick, onDragEnd }: GroupTabsProps) {
  const groupNames = useMemo(() => getGroupNames(items), [items])
  const [activeTab, setActiveTab] = useState<string | null>(groupNames[0] ?? null)

  // Reset active tab if it no longer exists
  useEffect(() => {
    if (!groupNames.includes(activeTab)) {
      setActiveTab(groupNames[0] ?? null)
    }
  }, [groupNames, activeTab])

  const activeItems = items.filter((i) => i.group_name === activeTab)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  return (
    <div>
      <div className="flex gap-1 border-b mb-3 overflow-x-auto">
        {groupNames.map((name) => {
          const count = items.filter((i) => i.group_name === name).length
          return (
            <button
              key={name ?? '__ungrouped'}
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === name
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab(name)}
            >
              {name ?? 'Ungrouped'} ({count})
            </button>
          )
        })}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext
          items={activeItems.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="border rounded-lg overflow-hidden">
            {activeItems.length === 0 && (
              <p className="text-muted-foreground text-sm py-6 text-center">No items in this group</p>
            )}
            {activeItems.map((item) => (
              <TodoItemRow
                key={item.id}
                item={item}
                persons={persons}
                onToggle={onToggle}
                onClick={onClick}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/features/todos/group-view-toggle.tsx src/components/features/todos/group-sections.tsx src/components/features/todos/group-tabs.tsx
git commit -m "feat: add group view components (sections, tabs, toggle)"
```

---

## Task 10: Integrate Groups into Todo Detail

**Files:**
- Modify: `src/components/features/todos/todo-detail.tsx`

- [ ] **Step 1: Add group view state and imports**

Add imports at top:

```typescript
import { GroupSections } from './group-sections'
import { GroupTabs } from './group-tabs'
import { GroupViewToggle } from './group-view-toggle'
```

Add state after existing state declarations (around line 52):

```typescript
  const [groupViewMode, setGroupViewMode] = useState<'sections' | 'tabs'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(`todo-group-view-${initialList.id}`) as 'sections' | 'tabs') || 'sections'
    }
    return 'sections'
  })

  const hasGroups = items.some((i) => i.group_name !== null && i.group_name !== undefined)
```

Add a handler for toggling view mode:

```typescript
  const handleGroupViewChange = (mode: 'sections' | 'tabs') => {
    setGroupViewMode(mode)
    localStorage.setItem(`todo-group-view-${list.id}`, mode)
  }
```

- [ ] **Step 2: Add "Save as template" to the dropdown menu**

In the `DropdownMenuContent`, after the Archive item and before the Delete item, add:

```typescript
            <DropdownMenuItem onClick={handleSaveAsTemplate}>Save as template</DropdownMenuItem>
```

Add the handler:

```typescript
  const handleSaveAsTemplate = async () => {
    const res = await fetch(`/api/todos/${list.id}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_template: true }),
    })
    if (res.ok) {
      toast.success('Saved as template')
    } else {
      toast.error('Failed to save template')
    }
  }
```

- [ ] **Step 3: Replace the pending items section with group-aware rendering**

Replace the `{/* Pending tasks */}` section (the `<div>` containing the DndContext at approximately lines 288-318) with:

```typescript
      {/* Pending tasks */}
      <div>
        {pendingItems.length === 0 && completedItems.length === 0 && (
          <p className="text-muted-foreground text-sm py-8 text-center">No tasks yet</p>
        )}
        {pendingItems.length > 0 && hasGroups && (
          <div className="flex justify-end mb-2">
            <GroupViewToggle mode={groupViewMode} onToggle={handleGroupViewChange} />
          </div>
        )}
        {pendingItems.length > 0 && hasGroups && groupViewMode === 'sections' && (
          <GroupSections
            items={pendingItems}
            persons={persons}
            onToggle={handleToggle}
            onClick={(i) => { setEditingItem(i); setEditDialogOpen(true) }}
            onDragEnd={handleDragEnd}
          />
        )}
        {pendingItems.length > 0 && hasGroups && groupViewMode === 'tabs' && (
          <GroupTabs
            items={pendingItems}
            persons={persons}
            onToggle={handleToggle}
            onClick={(i) => { setEditingItem(i); setEditDialogOpen(true) }}
            onDragEnd={handleDragEnd}
          />
        )}
        {pendingItems.length > 0 && !hasGroups && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext
              items={pendingItems.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="border rounded-lg overflow-hidden">
                {pendingItems.map((item) => (
                  <TodoItemRow
                    key={item.id}
                    item={item}
                    persons={persons}
                    onToggle={handleToggle}
                    onClick={(i) => { setEditingItem(i); setEditDialogOpen(true) }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/features/todos/todo-detail.tsx
git commit -m "feat: integrate group views and save-as-template into todo detail"
```

---

## Task 11: Add group_name to Item Dialog

**Files:**
- Modify: `src/components/features/todos/todo-item-dialog.tsx`

- [ ] **Step 1: Add group_name to the dialog state and onSave signature**

Add state:

```typescript
  const [groupName, setGroupName] = useState('')
```

Update the `useEffect` to include `group_name`:

```typescript
      setGroupName(item.group_name || '')
```

Update the `onSave` prop type to include `group_name`:

```typescript
  onSave: (data: {
    title: string
    description: string | null
    priority: TodoPriority
    due_date: string | null
    assigned_to: string | null
    group_name: string | null
  }) => Promise<void>
```

Add `group_name` to the save call:

```typescript
        group_name: groupName.trim() || null,
```

- [ ] **Step 2: Add group_name input field to the form**

After the assigned_to Select section and before the closing `</div>` of the form, add:

```typescript
          <div className="space-y-2">
            <Label htmlFor="task-group">Group</Label>
            <Input
              id="task-group"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Clothes, Toiletries"
            />
          </div>
```

- [ ] **Step 3: Update handleSaveItem in todo-detail.tsx to pass group_name**

In `todo-detail.tsx`, update the `handleSaveItem` function's data type to include `group_name: string | null` and pass it through to the PATCH call.

- [ ] **Step 4: Commit**

```bash
git add src/components/features/todos/todo-item-dialog.tsx src/components/features/todos/todo-detail.tsx
git commit -m "feat: add group_name field to todo item dialog"
```

---

## Task 12: My Tasks View Components

**Files:**
- Create: `src/components/features/todos/my-tasks-item-row.tsx`
- Create: `src/components/features/todos/my-tasks-view.tsx`

- [ ] **Step 1: Create the My Tasks item row**

```typescript
// src/components/features/todos/my-tasks-item-row.tsx
'use client'

import Link from 'next/link'
import { Checkbox } from '@/components/ui/checkbox'
import { getMemberBgClass } from '@/lib/utils/member-colors'
import { PRIORITY_COLORS } from '@/types/todos'
import type { MyTaskItem } from '@/types/todos'
import type { Person } from '@/types/person'

interface MyTasksItemRowProps {
  item: MyTaskItem
  persons: Person[]
  onToggle: (item: MyTaskItem) => void
  onClick: (item: MyTaskItem) => void
}

function getDueBadge(dueDate: string | null): { label: string; className: string } | null {
  if (!dueDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate + 'T00:00:00')
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) return { label: 'overdue', className: 'bg-red-500/20 text-red-400' }
  if (diffDays === 0) return { label: 'today', className: 'bg-amber-500/20 text-amber-400' }
  if (diffDays === 1) return { label: 'tomorrow', className: 'bg-blue-500/10 text-blue-400' }
  return {
    label: new Date(dueDate).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
    className: 'text-muted-foreground',
  }
}

export function MyTasksItemRow({ item, persons, onToggle, onClick }: MyTasksItemRowProps) {
  const priorityColor = PRIORITY_COLORS[item.priority]
  const dueBadge = getDueBadge(item.due_date)

  return (
    <div
      className="flex items-center gap-2 py-2.5 px-3 border-b last:border-b-0 hover:bg-muted/50"
      style={{ borderLeftWidth: priorityColor ? 3 : 0, borderLeftColor: priorityColor ?? undefined }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={item.status === 'completed'}
          onCheckedChange={() => onToggle(item)}
        />
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onClick(item)}>
        <span className="text-sm font-medium">{item.title}</span>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Link
            href={`/todos/${item.list_id}`}
            className="text-[10px] text-muted-foreground hover:text-foreground hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {item.list_color && (
              <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ background: item.list_color }} />
            )}
            {item.list_title}
          </Link>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {dueBadge && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${dueBadge.className}`}>
            {dueBadge.label}
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create the My Tasks view component**

```typescript
// src/components/features/todos/my-tasks-view.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { MyTasksItemRow } from './my-tasks-item-row'
import { TodoItemDialog } from './todo-item-dialog'
import type { MyTaskItem, TodoPriority } from '@/types/todos'
import type { Person } from '@/types/person'

interface MyTasksViewProps {
  householdId: string
  persons: Person[]
}

interface TimeBucket {
  label: string
  items: MyTaskItem[]
}

function bucketItems(items: MyTaskItem[]): TimeBucket[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  const endOfWeek = new Date(today)
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()))
  const weekEndStr = endOfWeek.toISOString().split('T')[0]

  const buckets: Record<string, MyTaskItem[]> = {
    'Overdue': [],
    'Due today': [],
    'Due this week': [],
    'Due later': [],
    'No due date': [],
  }

  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 }

  for (const item of items) {
    if (!item.due_date) {
      buckets['No due date'].push(item)
    } else if (item.due_date < todayStr) {
      buckets['Overdue'].push(item)
    } else if (item.due_date === todayStr) {
      buckets['Due today'].push(item)
    } else if (item.due_date <= weekEndStr) {
      buckets['Due this week'].push(item)
    } else {
      buckets['Due later'].push(item)
    }
  }

  // Sort within each bucket by priority
  for (const bucket of Object.values(buckets)) {
    bucket.sort((a, b) => (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4))
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }))
}

export function MyTasksView({ householdId, persons }: MyTasksViewProps) {
  const [items, setItems] = useState<MyTaskItem[]>([])
  const [loading, setLoading] = useState(true)
  const [editingItem, setEditingItem] = useState<MyTaskItem | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const fetchTasks = useCallback(async () => {
    const res = await fetch(`/api/todos/my-tasks?householdId=${householdId}`)
    if (res.ok) {
      setItems(await res.json())
    }
    setLoading(false)
  }, [householdId])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const handleToggle = async (item: MyTaskItem) => {
    const newStatus = item.status === 'completed' ? 'pending' : 'completed'
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    try {
      const res = await fetch(`/api/todos/${item.list_id}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        fetchTasks() // Revert on failure
        toast.error('Failed to update task')
      }
    } catch {
      fetchTasks()
      toast.error('Failed to update task')
    }
  }

  const handleSaveItem = async (data: {
    title: string
    description: string | null
    priority: TodoPriority
    due_date: string | null
    assigned_to: string | null
    group_name: string | null
  }) => {
    if (!editingItem) return
    const res = await fetch(`/api/todos/${editingItem.list_id}/items/${editingItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      fetchTasks()
    } else {
      toast.error('Failed to save task')
    }
  }

  const buckets = bucketItems(items)

  if (loading) {
    return <p className="text-muted-foreground text-sm py-8 text-center">Loading...</p>
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-muted-foreground text-lg">No tasks assigned to you.</p>
        <p className="text-muted-foreground text-sm mt-1">Tasks assigned to you across all lists will appear here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {buckets.map((bucket) => (
        <div key={bucket.label}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            {bucket.label} ({bucket.items.length})
          </p>
          <div className="border rounded-lg overflow-hidden">
            {bucket.items.map((item) => (
              <MyTasksItemRow
                key={item.id}
                item={item}
                persons={persons}
                onToggle={handleToggle}
                onClick={(i) => { setEditingItem(i); setEditDialogOpen(true) }}
              />
            ))}
          </div>
        </div>
      ))}

      <TodoItemDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        item={editingItem}
        persons={persons}
        onSave={handleSaveItem}
      />
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/features/todos/my-tasks-item-row.tsx src/components/features/todos/my-tasks-view.tsx
git commit -m "feat: add My Tasks view components"
```

---

## Task 13: Template Section Component

**Files:**
- Create: `src/components/features/todos/template-section.tsx`

- [ ] **Step 1: Create the template section**

```typescript
// src/components/features/todos/template-section.tsx
'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Trash2, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TodoListWithCounts } from '@/types/todos'

interface TemplateSectionProps {
  householdId: string
  onUseTemplate: (templateId: string) => void
}

export function TemplateSection({ householdId, onUseTemplate }: TemplateSectionProps) {
  const router = useRouter()
  const [templates, setTemplates] = useState<TodoListWithCounts[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/todos?householdId=${householdId}&templates=true`)
      .then((res) => res.json())
      .then((data) => setTemplates(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [householdId])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this template?')) return
    const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setTemplates((prev) => prev.filter((t) => t.id !== id))
    } else {
      toast.error('Failed to delete template')
    }
  }

  const handleUseTemplate = async (templateId: string) => {
    const res = await fetch(`/api/todos/${templateId}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_template: false }),
    })
    if (res.ok) {
      const created = await res.json()
      router.push(`/todos/${created.id}`)
      router.refresh()
    } else {
      toast.error('Failed to create from template')
    }
  }

  if (loading || templates.length === 0) return null

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        Templates
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {templates.map((t) => (
          <div
            key={t.id}
            className="border rounded-lg p-3"
            style={{ borderLeftWidth: t.color ? 4 : 1, borderLeftColor: t.color ?? undefined }}
          >
            <div className="flex justify-between items-start">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{t.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {t.total_items} item{t.total_items !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleUseTemplate(t.id)}
                  title="Use template"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => handleDelete(t.id)}
                  title="Delete template"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/todos/template-section.tsx
git commit -m "feat: add template section component"
```

---

## Task 14: Integrate My Tasks Toggle and Templates into Todo List View

**Files:**
- Modify: `src/components/features/todos/todo-list-view.tsx`
- Modify: `src/app/(dashboard)/todos/page.tsx`

- [ ] **Step 1: Add Lists/My Tasks toggle and template section to todo-list-view.tsx**

Add imports:

```typescript
import { MyTasksView } from './my-tasks-view'
import { TemplateSection } from './template-section'
```

Add state for view mode:

```typescript
  const [viewMode, setViewMode] = useState<'lists' | 'my-tasks'>('lists')
```

In the header section, add the toggle after the title:

```typescript
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 border rounded-md p-0.5">
            <button
              className={`px-3 py-1 text-xs font-medium rounded ${viewMode === 'lists' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setViewMode('lists')}
            >
              Lists
            </button>
            <button
              className={`px-3 py-1 text-xs font-medium rounded ${viewMode === 'my-tasks' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => setViewMode('my-tasks')}
            >
              My Tasks
            </button>
          </div>
        </div>
```

Wrap the existing list content in a conditional:

```typescript
      {viewMode === 'my-tasks' ? (
        <MyTasksView householdId={householdId} persons={persons} />
      ) : (
        <>
          {/* existing filter chips, empty states, pinned/unpinned sections */}

          {/* Template section at the bottom */}
          <TemplateSection householdId={householdId} onUseTemplate={() => {}} />
        </>
      )}
```

- [ ] **Step 2: Update page.tsx to exclude templates from server query**

In `src/app/(dashboard)/todos/page.tsx`, add `.eq('is_template', false)` to the todo_lists query, after `.eq('archived', false)`:

```typescript
      .eq('is_template', false)
```

This ensures templates never appear in the server-rendered initial list.

- [ ] **Step 3: Commit**

```bash
git add src/components/features/todos/todo-list-view.tsx src/app/(dashboard)/todos/page.tsx
git commit -m "feat: add Lists/My Tasks toggle and templates section to todos page"
```

---

## Task 15: Attach List Control for Calendar Events

**Files:**
- Create: `src/components/features/calendar/attach-list-control.tsx`

- [ ] **Step 1: Create the attach-list control component**

```typescript
// src/components/features/calendar/attach-list-control.tsx
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ListTodo, X } from 'lucide-react'
import type { TodoList } from '@/types/todos'

interface AttachListControlProps {
  householdId: string
  eventId: string | null // null when creating a new event
  currentListId: string | null
  onChange: (mode: 'none' | 'existing' | 'template' | 'new', listId: string | null) => void
}

export function AttachListControl({ householdId, eventId, currentListId, onChange }: AttachListControlProps) {
  const [lists, setLists] = useState<TodoList[]>([])
  const [templates, setTemplates] = useState<TodoList[]>([])
  const [mode, setMode] = useState<'none' | 'existing' | 'template' | 'new'>('none')
  const [selectedId, setSelectedId] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Fetch available (unlinked) lists and templates
    Promise.all([
      fetch(`/api/todos?householdId=${householdId}`).then((r) => r.json()),
      fetch(`/api/todos?householdId=${householdId}&templates=true`).then((r) => r.json()),
    ]).then(([listsData, templatesData]) => {
      // Only show lists that don't already have an event_id (unless it's the current event)
      setLists((listsData || []).filter((l: any) => !l.event_id || l.event_id === eventId))
      setTemplates(templatesData || [])
    })
  }, [householdId, eventId])

  if (currentListId) {
    const linked = lists.find((l) => l.id === currentListId)
    return (
      <div className="space-y-2">
        <Label>Linked List</Label>
        <div className="flex items-center gap-2 text-sm">
          <ListTodo className="h-4 w-4 text-muted-foreground" />
          <span>{linked?.title ?? 'Linked list'}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => onChange('none', null)}
            title="Detach list"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Label>Attach List</Label>
      <Select value={mode} onValueChange={(v) => {
        const m = v as 'none' | 'existing' | 'template' | 'new'
        setMode(m)
        setSelectedId('')
        if (m === 'new') onChange('new', null)
        else if (m === 'none') onChange('none', null)
      }}>
        <SelectTrigger>
          <SelectValue placeholder="No list" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No list</SelectItem>
          <SelectItem value="new">Create new list</SelectItem>
          {templates.length > 0 && <SelectItem value="template">From template</SelectItem>}
          {lists.length > 0 && <SelectItem value="existing">Attach existing list</SelectItem>}
        </SelectContent>
      </Select>

      {mode === 'existing' && (
        <Select value={selectedId} onValueChange={(v) => { setSelectedId(v); onChange('existing', v) }}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a list..." />
          </SelectTrigger>
          <SelectContent>
            {lists.map((l) => (
              <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {mode === 'template' && (
        <Select value={selectedId} onValueChange={(v) => { setSelectedId(v); onChange('template', v) }}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a template..." />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}
```

Note: The exact integration with event save flow is complex — the parent `EventDialog` will need to handle: (1) if mode=new, create a blank list and link, (2) if mode=template, clone the template and link, (3) if mode=existing, link the existing list. This logic will live in the `calendar-view.tsx` handleSave function.

- [ ] **Step 2: Commit**

```bash
git add src/components/features/calendar/attach-list-control.tsx
git commit -m "feat: add attach-list control for calendar event dialog"
```

---

## Task 16: Integrate Attach List into Event Dialog

**Files:**
- Modify: `src/components/features/calendar/event-dialog.tsx`
- Modify: `src/components/features/calendar/calendar-view.tsx`

- [ ] **Step 1: Add list attachment state to EventDialog**

Add import:

```typescript
import { AttachListControl } from './attach-list-control'
```

Add to the `EventDialogProps` interface:

```typescript
  householdId: string
```

Add state:

```typescript
  const [attachMode, setAttachMode] = useState<'none' | 'existing' | 'template' | 'new'>('none')
  const [attachListId, setAttachListId] = useState<string | null>(null)
```

In the `useEffect` that populates form state from `event`, initialize from `list_progress`:

```typescript
      // Initialize linked list state from event's list_progress
      if (event?.list_progress?.list_id) {
        setAttachMode('existing')
        setAttachListId(event.list_progress.list_id)
      } else {
        setAttachMode('none')
        setAttachListId(null)
      }
```

Add the `onSave` data type extension — add to the save data object:

```typescript
    attach_mode: attachMode,
    attach_list_id: attachListId,
```

Add the `AttachListControl` into the form body (after the description section):

```typescript
          <AttachListControl
            householdId={householdId}
            eventId={event?.id ?? null}
            currentListId={event?.list_progress?.list_id ?? null}
            onChange={(mode, id) => { setAttachMode(mode); setAttachListId(id) }}
          />
```

- [ ] **Step 2: Update calendar-view.tsx handleSave to handle list attachment**

In the `handleSave` function, after the event is created/updated, handle list attachment based on `attach_mode`:

```typescript
    // Handle list attachment after event save
    if (data.attach_mode === 'new' && savedEvent.id) {
      await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          household_id: householdId,
          title: `${data.title} checklist`,
          list_type: 'checklist',
          event_id: savedEvent.id,
        }),
      })
    } else if (data.attach_mode === 'template' && data.attach_list_id && savedEvent.id) {
      await fetch(`/api/todos/${data.attach_list_id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_template: false, event_id: savedEvent.id }),
      })
    } else if (data.attach_mode === 'existing' && data.attach_list_id && savedEvent.id) {
      await fetch(`/api/todos/${data.attach_list_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: savedEvent.id }),
      })
    }
```

Pass `householdId` to `EventDialog` in `calendar-view.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/features/calendar/event-dialog.tsx src/components/features/calendar/calendar-view.tsx
git commit -m "feat: integrate list attachment into calendar event creation/editing"
```

---

## Task 17: Calendar Progress Badge on Events

**Files:**
- Modify: `src/components/features/calendar/event-pill.tsx`
- Modify: `src/components/features/calendar/event-block.tsx`

- [ ] **Step 1: Add progress badge to EventPill**

Update the `CalendarEvent` type usage to include `list_progress`:

```typescript
interface EventWithProgress extends CalendarEvent {
  list_progress?: { list_id: string; total: number; completed: number } | null
}
```

Update the props to use `EventWithProgress`. After the title text, add:

```typescript
      {event.list_progress && event.list_progress.total > 0 && (
        <span className="ml-1 opacity-80">
          {event.list_progress.completed}/{event.list_progress.total}
        </span>
      )}
```

- [ ] **Step 2: Add progress badge to EventBlock**

Same pattern — extend the type and add the badge after the title:

```typescript
      {event.list_progress && event.list_progress.total > 0 && (
        <div className="opacity-80 text-[9px]">
          ☑ {event.list_progress.completed}/{event.list_progress.total}
        </div>
      )}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/features/calendar/event-pill.tsx src/components/features/calendar/event-block.tsx
git commit -m "feat: show linked list progress badge on calendar events"
```

---

## Task 18: Update Seed Data

**Files:**
- Modify: `supabase/seed.sql`

- [ ] **Step 1: Add template and grouped list seed data**

Append to the existing seed.sql (after existing todo data):

```sql
-- Template: Packing list
INSERT INTO todo_lists (id, household_id, title, list_type, is_template, created_by)
VALUES ('00000000-0000-0000-0000-000000000901', (SELECT id FROM households LIMIT 1), 'Holiday Packing', 'checklist', true, (SELECT id FROM profiles LIMIT 1));

INSERT INTO todo_items (list_id, title, group_name, sort_order, created_by) VALUES
  ('00000000-0000-0000-0000-000000000901', 'T-shirts', 'Clothes', 0, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000901', 'Shorts', 'Clothes', 1, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000901', 'Swimwear', 'Clothes', 2, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000901', 'Toothbrush', 'Toiletries', 3, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000901', 'Sunscreen', 'Toiletries', 4, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000901', 'Phone charger', 'Electronics', 5, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000901', 'Headphones', 'Electronics', 6, (SELECT id FROM profiles LIMIT 1));

-- Template: Weekly chores
INSERT INTO todo_lists (id, household_id, title, list_type, is_template, created_by)
VALUES ('00000000-0000-0000-0000-000000000902', (SELECT id FROM households LIMIT 1), 'Weekly Chores', 'general', true, (SELECT id FROM profiles LIMIT 1));

INSERT INTO todo_items (list_id, title, sort_order, created_by) VALUES
  ('00000000-0000-0000-0000-000000000902', 'Vacuum downstairs', 0, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000902', 'Clean bathrooms', 1, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000902', 'Mop kitchen', 2, (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000902', 'Change bedsheets', 3, (SELECT id FROM profiles LIMIT 1));

-- Event-linked list (linked to first calendar event)
INSERT INTO todo_lists (id, household_id, title, list_type, event_id, created_by)
VALUES ('00000000-0000-0000-0000-000000000903', (SELECT id FROM households LIMIT 1), 'Trip Prep', 'checklist',
  (SELECT id FROM calendar_events LIMIT 1), (SELECT id FROM profiles LIMIT 1));

INSERT INTO todo_items (list_id, title, sort_order, status, created_by) VALUES
  ('00000000-0000-0000-0000-000000000903', 'Book hotel', 0, 'completed', (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000903', 'Pack bags', 1, 'pending', (SELECT id FROM profiles LIMIT 1)),
  ('00000000-0000-0000-0000-000000000903', 'Arrange pet sitter', 2, 'pending', (SELECT id FROM profiles LIMIT 1));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: add template seed data for todos completion"
```

---

## Task 19: "From Template" Option in Todo List Dialog

**Files:**
- Modify: `src/components/features/todos/todo-list-dialog.tsx`

- [ ] **Step 1: Add template selection to the create dialog**

Add state for template mode:

```typescript
  const [fromTemplate, setFromTemplate] = useState(false)
  const [templates, setTemplates] = useState<TodoList[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
```

Fetch templates when dialog opens for creation:

```typescript
  useEffect(() => {
    if (open && !list) {
      // Fetch templates for "from template" option
      // householdId needs to be passed as a prop
      fetch(`/api/todos?householdId=${householdId}&templates=true`)
        .then((r) => r.json())
        .then((data) => setTemplates(data || []))
        .catch(() => {})
    }
  }, [open, list, householdId])
```

Add `householdId: string` to the `TodoListDialogProps` interface and pass it through from `todo-list-view.tsx` and `todo-detail.tsx`.

In the dialog form, when creating (not editing), add a toggle before the type selector:

```typescript
          {!list && templates.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="from-template"
                checked={fromTemplate}
                onCheckedChange={(checked) => { setFromTemplate(checked === true); setSelectedTemplateId('') }}
              />
              <Label htmlFor="from-template" className="font-normal">From template</Label>
            </div>
          )}

          {!list && fromTemplate && (
            <div className="space-y-2">
              <Label>Template</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
```

Import `Checkbox` from `@/components/ui/checkbox`.

- [ ] **Step 2: Update onSave signature to include template info**

Extend the `onSave` data type:

```typescript
  onSave: (data: {
    title: string
    list_type: TodoListType
    color: string | null
    default_assigned_to: string | null
    from_template_id?: string
  }) => Promise<void>
```

In `handleSave`, include the template ID:

```typescript
      await onSave({
        title: title.trim(),
        list_type: listType,
        color,
        default_assigned_to: defaultAssignee === 'none' ? null : defaultAssignee,
        from_template_id: fromTemplate && selectedTemplateId ? selectedTemplateId : undefined,
      })
```

- [ ] **Step 3: Handle template cloning in todo-list-view.tsx handleCreate**

In `todo-list-view.tsx`, update `handleCreate` to check for `from_template_id`:

```typescript
  const handleCreate = async (data: {
    title: string
    list_type: TodoListType
    color: string | null
    default_assigned_to: string | null
    from_template_id?: string
  }) => {
    let res
    if (data.from_template_id) {
      // Clone from template
      res = await fetch(`/api/todos/${data.from_template_id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: data.title, is_template: false }),
      })
    } else {
      res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: householdId, ...data }),
      })
    }
    if (res.ok) {
      const created = await res.json()
      router.push(`/todos/${created.id}`)
      router.refresh()
    } else {
      toast.error('Failed to create list')
    }
  }
```

- [ ] **Step 4: Commit**

```bash
git add src/components/features/todos/todo-list-dialog.tsx src/components/features/todos/todo-list-view.tsx
git commit -m "feat: add 'from template' option to todo list creation dialog"
```

---

## Task 20: Calendar View Data Plumbing for List Progress

**Files:**
- Modify: `src/components/features/calendar/calendar-view.tsx`
- Modify: `src/types/calendar.ts`

- [ ] **Step 1: Extend CalendarEvent type with list_progress**

In `src/types/calendar.ts`, add:

```typescript
export interface ListProgress {
  list_id: string
  total: number
  completed: number
}

export interface CalendarEventWithProgress extends CalendarEvent {
  list_progress: ListProgress | null
}
```

- [ ] **Step 2: Update calendar-view.tsx to use CalendarEventWithProgress**

In `calendar-view.tsx`, change the events state type from `CalendarEvent[]` to `CalendarEventWithProgress[]`. The API already returns `list_progress` (from Task 8), so the data flows through automatically.

Update all places where events are passed to child components (`EventPill`, `EventBlock`, `EventDialog`) to use the extended type. The child components (updated in Task 17) already accept `list_progress` via `EventWithProgress`.

- [ ] **Step 3: Update EventDialog to receive list_progress for edit case**

When passing an event to `EventDialog` for editing, ensure the `list_progress` field is included so the `AttachListControl` can show the current linked list (as addressed in Task 16's `useEffect` initialization).

- [ ] **Step 4: Commit**

```bash
git add src/types/calendar.ts src/components/features/calendar/calendar-view.tsx
git commit -m "feat: plumb list_progress through calendar view to child components"
```

---

## Task 21: Verify and Fix Integration

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`

Verify no build errors.

- [ ] **Step 2: Test each feature manually**

Navigate to `/todos` and verify:
1. Lists/My Tasks toggle works
2. Template section appears at bottom (after seed data is loaded)
3. Creating a list "from template" works
4. Opening a list with grouped items shows sections/tabs toggle
5. "Save as template" in the list menu works
6. Navigate to `/calendar`, create event with attached list
7. Progress badge shows on events with linked lists

- [ ] **Step 3: Fix any issues found**

Address any TypeScript errors, missing props, or broken flows.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: integration fixes for todos completion features"
```
