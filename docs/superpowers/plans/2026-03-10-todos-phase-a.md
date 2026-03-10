# Todos Phase A Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add todo list and task management with list CRUD (general/checklist/project types), task CRUD with priority/due dates/assignment, a landing page with filters and pinned lists, and an Amalfi coast color palette.

**Architecture:** Tiny migration adding two columns to existing `todo_lists` table. New API routes in `src/app/api/todos/`. Client components in `src/components/features/todos/`. Server component pages at `src/app/(dashboard)/todos/`. Follows exact patterns established by the shopping feature (which uses the same underlying `todo_lists`/`todo_items` tables).

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + RLS), shadcn/ui, Tailwind CSS, TypeScript.

**Spec:** `docs/superpowers/specs/2026-03-10-todos-phase-a-design.md`

---

## File Structure

### New Files
- `supabase/migrations/00013_todo_default_assignee.sql` — Add default_assigned_to + updated_at to todo_lists
- `src/types/todos.ts` — TypeScript types, Amalfi palette, priority colors
- `src/app/api/todos/route.ts` — GET (list all) + POST (create list)
- `src/app/api/todos/[id]/route.ts` — GET (single list + items) + PUT (update list) + DELETE
- `src/app/api/todos/[id]/items/route.ts` — POST (create task)
- `src/app/api/todos/[id]/items/[itemId]/route.ts` — PATCH (update task) + DELETE
- `src/components/features/todos/todo-list-card.tsx` — Single list card
- `src/components/features/todos/todo-list-dialog.tsx` — Create/edit list dialog
- `src/components/features/todos/todo-list-view.tsx` — Landing page component
- `src/components/features/todos/todo-item-row.tsx` — Single task row
- `src/components/features/todos/todo-item-dialog.tsx` — Task edit dialog
- `src/components/features/todos/todo-detail.tsx` — List detail component
- `src/app/(dashboard)/todos/[id]/page.tsx` — Detail server page

### Modified Files
- `src/app/(dashboard)/todos/page.tsx` — Replace stub with server component

---

## Chunk 1: Database + Types + API Routes

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00013_todo_default_assignee.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration: 00013_todo_default_assignee.sql
-- Add default_assigned_to and updated_at to todo_lists

ALTER TABLE public.todo_lists ADD COLUMN default_assigned_to uuid;
ALTER TABLE public.todo_lists ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER todo_lists_updated_at
  BEFORE UPDATE ON public.todo_lists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00013_todo_default_assignee.sql
git commit -m "feat(todos): add default_assigned_to and updated_at to todo_lists"
```

### Task 2: TypeScript Types

**Files:**
- Create: `src/types/todos.ts`

- [ ] **Step 1: Create types file**

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

export type TodoListType = TodoList['list_type']
export type TodoPriority = TodoItem['priority']

export const TODO_LIST_TYPES: { value: TodoListType; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'project', label: 'Project' },
]

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

export const AMALFI_HEX_SET = new Set(AMALFI_COLORS.map((c) => c.hex))

export const PRIORITY_COLORS: Record<TodoPriority, string | null> = {
  urgent: '#ef4444',
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#3b82f6',
  none: null,
}

export const PRIORITIES: { value: TodoPriority; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]
```

- [ ] **Step 2: Commit**

```bash
git add src/types/todos.ts
git commit -m "feat(todos): add TypeScript types, Amalfi palette, and priority colors"
```

### Task 3: List API Routes — GET + POST

**Files:**
- Create: `src/app/api/todos/route.ts`

- [ ] **Step 1: Write GET and POST route handlers**

GET fetches all non-shopping, non-archived (by default) lists with embedded todo_items for count computation. POST creates a new list with validation.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AMALFI_HEX_SET } from '@/types/todos'

const VALID_LIST_TYPES = new Set(['general', 'checklist', 'project'])

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const householdId = url.searchParams.get('householdId')
  const showArchived = url.searchParams.get('archived') === 'true'

  if (!householdId) return NextResponse.json({ error: 'householdId is required' }, { status: 400 })

  let query = supabase
    .from('todo_lists')
    .select(`
      *,
      todo_items(id, status, priority, due_date)
    `)
    .eq('household_id', householdId)
    .neq('list_type', 'shopping')
    .order('created_at', { ascending: false })

  if (showArchived) {
    query = query.eq('archived', true)
  } else {
    query = query.eq('archived', false)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const today = new Date().toISOString().split('T')[0]

  const lists = (data || []).map((list: any) => {
    const items = list.todo_items || []
    return {
      ...list,
      todo_items: undefined,
      total_items: items.length,
      completed_items: items.filter((i: any) => i.status === 'completed').length,
      overdue_count: items.filter((i: any) => i.due_date && i.due_date < today && i.status !== 'completed').length,
      high_priority_count: items.filter((i: any) => (i.priority === 'high' || i.priority === 'urgent') && i.status !== 'completed').length,
      due_today_count: items.filter((i: any) => i.due_date === today && i.status !== 'completed').length,
    }
  })

  return NextResponse.json(lists)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { household_id, title, list_type, color, default_assigned_to } = body

  if (!household_id || !title?.trim()) {
    return NextResponse.json({ error: 'household_id and title are required' }, { status: 400 })
  }
  if (!list_type || !VALID_LIST_TYPES.has(list_type)) {
    return NextResponse.json({ error: 'list_type must be general, checklist, or project' }, { status: 400 })
  }
  if (color && !AMALFI_HEX_SET.has(color)) {
    return NextResponse.json({ error: 'Invalid color' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('todo_lists')
    .insert({
      household_id,
      title: title.trim(),
      list_type,
      color: color ?? null,
      default_assigned_to: default_assigned_to ?? null,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/todos/route.ts
git commit -m "feat(todos): add GET and POST list API routes"
```

### Task 4: Single List API Routes — GET + PUT + DELETE

**Files:**
- Create: `src/app/api/todos/[id]/route.ts`

- [ ] **Step 1: Write route handlers with list type guard**

All routes verify the list is not a shopping list.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AMALFI_HEX_SET } from '@/types/todos'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('todo_lists')
    .select(`
      *,
      todo_items(*)
    `)
    .eq('id', id)
    .neq('list_type', 'shopping')
    .order('sort_order', { referencedTable: 'todo_items', ascending: true })
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify not a shopping list
  const { data: existing } = await supabase
    .from('todo_lists')
    .select('list_type')
    .eq('id', id)
    .single()
  if (!existing || existing.list_type === 'shopping') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if ('title' in body) updates.title = body.title?.trim()
  if ('color' in body) {
    if (body.color && !AMALFI_HEX_SET.has(body.color)) {
      return NextResponse.json({ error: 'Invalid color' }, { status: 400 })
    }
    updates.color = body.color ?? null
  }
  if ('pinned' in body) updates.pinned = body.pinned
  if ('archived' in body) updates.archived = body.archived
  if ('default_assigned_to' in body) updates.default_assigned_to = body.default_assigned_to ?? null

  const { data, error } = await supabase
    .from('todo_lists')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify not a shopping list
  const { data: existing } = await supabase
    .from('todo_lists')
    .select('list_type')
    .eq('id', id)
    .single()
  if (!existing || existing.list_type === 'shopping') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error } = await supabase.from('todo_lists').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/todos/\\[id\\]/route.ts
git commit -m "feat(todos): add GET, PUT, DELETE single list API routes"
```

### Task 5: Task Item API Routes

**Files:**
- Create: `src/app/api/todos/[id]/items/route.ts`
- Create: `src/app/api/todos/[id]/items/[itemId]/route.ts`

- [ ] **Step 1: Write POST route for creating tasks**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: listId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify list exists and is not shopping
  const { data: list } = await supabase
    .from('todo_lists')
    .select('id, list_type, default_assigned_to')
    .eq('id', listId)
    .neq('list_type', 'shopping')
    .single()
  if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 })

  const body = await request.json()
  if (!body.title?.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }

  // Get max sort_order for this list
  const { data: maxRow } = await supabase
    .from('todo_items')
    .select('sort_order')
    .eq('list_id', listId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .single()

  const nextSortOrder = maxRow ? maxRow.sort_order + 1 : 0

  const { data, error } = await supabase
    .from('todo_items')
    .insert({
      list_id: listId,
      title: body.title.trim(),
      description: body.description ?? null,
      priority: body.priority ?? 'none',
      due_date: body.due_date ?? null,
      assigned_to: body.assigned_to ?? list.default_assigned_to ?? null,
      sort_order: body.sort_order ?? nextSortOrder,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Write PATCH and DELETE routes for individual tasks**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: listId, itemId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify list exists and is not shopping
  const { data: list } = await supabase
    .from('todo_lists')
    .select('list_type')
    .eq('id', listId)
    .neq('list_type', 'shopping')
    .single()
  if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if ('status' in body) {
    updates.status = body.status
    updates.completed_at = body.status === 'completed' ? new Date().toISOString() : null
  }
  if ('title' in body) updates.title = body.title?.trim()
  if ('description' in body) updates.description = body.description ?? null
  if ('priority' in body) updates.priority = body.priority
  if ('due_date' in body) updates.due_date = body.due_date ?? null
  if ('assigned_to' in body) updates.assigned_to = body.assigned_to ?? null
  if ('sort_order' in body) updates.sort_order = body.sort_order

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('todo_items')
    .update(updates)
    .eq('id', itemId)
    .eq('list_id', listId)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const { id: listId, itemId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify list exists and is not shopping
  const { data: list } = await supabase
    .from('todo_lists')
    .select('list_type')
    .eq('id', listId)
    .neq('list_type', 'shopping')
    .single()
  if (!list) return NextResponse.json({ error: 'List not found' }, { status: 404 })

  const { error } = await supabase.from('todo_items').delete().eq('id', itemId).eq('list_id', listId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/todos/\\[id\\]/items/route.ts src/app/api/todos/\\[id\\]/items/\\[itemId\\]/route.ts
git commit -m "feat(todos): add task create, update, and delete API routes"
```

---

## Chunk 2: Landing Page UI

### Task 6: Todo List Card Component

**Files:**
- Create: `src/components/features/todos/todo-list-card.tsx`

- [ ] **Step 1: Write the list card component**

Renders a single list card for the landing page grid: Amalfi color border, title, type + progress, pin icon, summary hints.

```typescript
'use client'

import Link from 'next/link'
import { Pin } from 'lucide-react'
import type { TodoListWithCounts } from '@/types/todos'

interface TodoListCardProps {
  list: TodoListWithCounts
  onUnarchive?: (id: string) => void
}

export function TodoListCard({ list, onUnarchive }: TodoListCardProps) {
  const allDone = list.total_items > 0 && list.completed_items === list.total_items
  const typeLabel = list.list_type.charAt(0).toUpperCase() + list.list_type.slice(1)

  return (
    <Link href={`/todos/${list.id}`}>
      <div
        className="border rounded-lg p-3 hover:bg-muted/50 transition-colors cursor-pointer"
        style={{ borderLeftWidth: list.color ? 4 : 1, borderLeftColor: list.color ?? undefined }}
      >
        <div className="flex justify-between items-start">
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{list.title}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {typeLabel} · {list.completed_items}/{list.total_items} done{allDone && list.total_items > 0 ? ' ✓' : ''}
            </div>
          </div>
          {list.pinned && (
            <Pin className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
          )}
        </div>
        {onUnarchive && (
          <button
            className="text-xs text-primary hover:underline mt-2"
            onClick={(e) => { e.preventDefault(); onUnarchive(list.id) }}
          >
            Unarchive
          </button>
        )}
        {(list.overdue_count > 0 || list.high_priority_count > 0 || list.due_today_count > 0) && (
          <div className="flex gap-3 mt-2 text-[11px] text-muted-foreground">
            {list.overdue_count > 0 && <span className="text-red-500">{list.overdue_count} overdue</span>}
            {list.high_priority_count > 0 && <span className="text-red-500">{list.high_priority_count} high</span>}
            {list.due_today_count > 0 && <span className="text-amber-500">{list.due_today_count} due today</span>}
          </div>
        )}
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/todos/todo-list-card.tsx
git commit -m "feat(todos): add todo list card component"
```

### Task 7: Todo List Dialog (Create/Edit)

**Files:**
- Create: `src/components/features/todos/todo-list-dialog.tsx`

- [ ] **Step 1: Write the create/edit list dialog**

Dialog with title, type (create only), Amalfi color picker, and default assignee.

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { AMALFI_COLORS, TODO_LIST_TYPES } from '@/types/todos'
import type { TodoList, TodoListType } from '@/types/todos'

interface Person {
  id: string
  display_name: string | null
}

interface TodoListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  list: TodoList | null // null = creating
  persons: Person[]
  onSave: (data: {
    title: string
    list_type: TodoListType
    color: string | null
    default_assigned_to: string | null
  }) => Promise<void>
}

export function TodoListDialog({
  open,
  onOpenChange,
  list,
  persons,
  onSave,
}: TodoListDialogProps) {
  const [title, setTitle] = useState('')
  const [listType, setListType] = useState<TodoListType>('general')
  const [color, setColor] = useState<string | null>(null)
  const [defaultAssignee, setDefaultAssignee] = useState('none')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (list) {
        setTitle(list.title)
        setListType(list.list_type)
        setColor(list.color)
        setDefaultAssignee(list.default_assigned_to || 'none')
      } else {
        setTitle('')
        setListType('general')
        setColor(null)
        setDefaultAssignee('none')
      }
    }
  }, [open, list])

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        list_type: listType,
        color,
        default_assigned_to: defaultAssignee === 'none' ? null : defaultAssignee,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{list ? 'Edit List' : 'New List'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="list-title">Title</Label>
            <Input
              id="list-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Weekly Chores"
              autoFocus
            />
          </div>

          {!list && (
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={listType} onValueChange={(v) => setListType(v as TodoListType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TODO_LIST_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                className={`w-8 h-8 rounded-full border-2 ${color === null ? 'border-foreground' : 'border-transparent'}`}
                style={{ background: 'var(--muted)' }}
                onClick={() => setColor(null)}
                title="No color"
              />
              {AMALFI_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  className={`w-8 h-8 rounded-full border-2 ${color === c.hex ? 'border-foreground' : 'border-transparent'}`}
                  style={{ background: c.hex }}
                  onClick={() => setColor(c.hex)}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Default Assignee</Label>
            <Select value={defaultAssignee} onValueChange={setDefaultAssignee}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {persons.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.display_name || 'Unknown'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {list ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/todos/todo-list-dialog.tsx
git commit -m "feat(todos): add todo list create/edit dialog with Amalfi color picker"
```

### Task 8: Todo List View (Landing Page Component)

**Files:**
- Create: `src/components/features/todos/todo-list-view.tsx`

- [ ] **Step 1: Write the landing page client component**

Filter chips (All/General/Checklists/Projects/Archived), pinned section, all lists grid, new list dialog integration.

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { TodoListCard } from './todo-list-card'
import { TodoListDialog } from './todo-list-dialog'
import type { TodoListWithCounts, TodoListType } from '@/types/todos'

interface Person {
  id: string
  display_name: string | null
}

interface TodoListViewProps {
  lists: TodoListWithCounts[]
  householdId: string
  persons: Person[]
}

type FilterType = 'all' | TodoListType | 'archived'

export function TodoListView({ lists: initialLists, householdId, persons }: TodoListViewProps) {
  const router = useRouter()
  const [lists, setLists] = useState(initialLists)
  const [filter, setFilter] = useState<FilterType>('all')
  const [dialogOpen, setDialogOpen] = useState(false)

  const filteredLists = filter === 'all' || filter === 'archived'
    ? lists
    : lists.filter((l) => l.list_type === filter)

  const pinnedLists = filteredLists.filter((l) => l.pinned)
  const unpinnedLists = filteredLists.filter((l) => !l.pinned)

  const handleUnarchive = async (id: string) => {
    const res = await fetch(`/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    })
    if (res.ok) {
      setLists((prev) => prev.filter((l) => l.id !== id))
    }
  }

  const handleCreate = async (data: {
    title: string
    list_type: TodoListType
    color: string | null
    default_assigned_to: string | null
  }) => {
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ household_id: householdId, ...data }),
    })
    if (res.ok) {
      const created = await res.json()
      router.push(`/todos/${created.id}`)
      router.refresh()
    }
  }

  const handleFilterChange = (f: FilterType) => {
    setFilter(f)
    if (f === 'archived') {
      // Fetch archived lists
      fetch(`/api/todos?householdId=${householdId}&archived=true`)
        .then((res) => res.json())
        .then((data) => setLists(data))
    } else if (filter === 'archived') {
      // Switching back from archived, restore initial
      fetch(`/api/todos?householdId=${householdId}`)
        .then((res) => res.json())
        .then((data) => setLists(data))
    }
  }

  const filters: { value: FilterType; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'general', label: 'General' },
    { value: 'checklist', label: 'Checklists' },
    { value: 'project', label: 'Projects' },
    { value: 'archived', label: 'Archived' },
  ]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Todos</h1>
          <p className="text-sm text-muted-foreground">{lists.length} list{lists.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New List
        </Button>
      </div>

      {/* Filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        {filters.map((f) => (
          <button
            key={f.value}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === f.value
                ? 'bg-primary text-primary-foreground'
                : 'border hover:bg-muted'
            }`}
            onClick={() => handleFilterChange(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {lists.length === 0 && filter !== 'archived' && (
        <div className="py-12 text-center">
          <p className="text-muted-foreground text-lg">No todo lists yet.</p>
          <p className="text-muted-foreground text-sm mt-1">Create a list to get started.</p>
        </div>
      )}

      {filteredLists.length === 0 && lists.length > 0 && filter !== 'all' && (
        <div className="py-8 text-center">
          <p className="text-muted-foreground">No {filter === 'archived' ? 'archived' : filter} lists.</p>
        </div>
      )}

      {/* Pinned section */}
      {pinnedLists.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            📌 Pinned
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pinnedLists.map((list) => (
              <TodoListCard key={list.id} list={list} onUnarchive={filter === 'archived' ? handleUnarchive : undefined} />
            ))}
          </div>
        </div>
      )}

      {/* All lists */}
      {unpinnedLists.length > 0 && (
        <div>
          {pinnedLists.length > 0 && (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              All Lists
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {unpinnedLists.map((list) => (
              <TodoListCard key={list.id} list={list} onUnarchive={filter === 'archived' ? handleUnarchive : undefined} />
            ))}
          </div>
        </div>
      )}

      {/* Create dialog */}
      <TodoListDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        list={null}
        persons={persons}
        onSave={handleCreate}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/todos/todo-list-view.tsx
git commit -m "feat(todos): add todo list view landing page component"
```

### Task 9: Todos Landing Page (Server Component)

**Files:**
- Modify: `src/app/(dashboard)/todos/page.tsx`

- [ ] **Step 1: Replace the stub with the server component**

```typescript
import { createClient } from '@/lib/supabase/server'
import { TodoListView } from '@/components/features/todos/todo-list-view'

export default async function TodosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id')
    .eq('id', user.id)
    .single()

  const householdId = profile?.default_household_id
  if (!householdId) return null

  // Fetch non-archived, non-shopping lists with item counts
  const { data: lists } = await (supabase as any)
    .from('todo_lists')
    .select(`
      *,
      todo_items(id, status, priority, due_date)
    `)
    .eq('household_id', householdId)
    .neq('list_type', 'shopping')
    .eq('archived', false)
    .order('created_at', { ascending: false })

  const today = new Date().toISOString().split('T')[0]

  const todoLists = (lists || []).map((list: any) => {
    const items = list.todo_items || []
    return {
      ...list,
      todo_items: undefined,
      total_items: items.length,
      completed_items: items.filter((i: any) => i.status === 'completed').length,
      overdue_count: items.filter((i: any) => i.due_date && i.due_date < today && i.status !== 'completed').length,
      high_priority_count: items.filter((i: any) => (i.priority === 'high' || i.priority === 'urgent') && i.status !== 'completed').length,
      due_today_count: items.filter((i: any) => i.due_date === today && i.status !== 'completed').length,
    }
  })

  // Fetch household persons for assignee picker
  const { data: persons } = await supabase
    .from('household_persons')
    .select('id, display_name')
    .eq('household_id', householdId)

  return <TodoListView lists={todoLists} householdId={householdId} persons={persons || []} />
}
```

Note: Uses `(supabase as any)` because the generated types may not include `default_assigned_to` and `updated_at` columns yet. The `todo_lists` table is known to Supabase types but the new columns aren't — this cast avoids type errors on the select while the rest of the query chain works fine.

- [ ] **Step 2: Commit**

```bash
git add src/app/\\(dashboard\\)/todos/page.tsx
git commit -m "feat(todos): replace stub page with server component landing page"
```

---

## Chunk 3: List Detail UI

### Task 10: Todo Item Row Component

**Files:**
- Create: `src/components/features/todos/todo-item-row.tsx`

- [ ] **Step 1: Write the task row component**

Minimal row: checkbox, priority left border, title, due date badge, assignee avatar. Clicking the row opens the edit dialog (handled by parent).

```typescript
'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { getMemberBgClass } from '@/lib/utils/member-colors'
import { PRIORITY_COLORS } from '@/types/todos'
import type { TodoItem } from '@/types/todos'

interface Person {
  id: string
  display_name: string | null
}

interface TodoItemRowProps {
  item: TodoItem
  persons: Person[]
  onToggle: (item: TodoItem) => void
  onClick: (item: TodoItem) => void
}

function getDueBadge(dueDate: string | null, isCompleted: boolean): { label: string; className: string } | null {
  if (!dueDate || isCompleted) return null
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

export function TodoItemRow({ item, persons, onToggle, onClick }: TodoItemRowProps) {
  const priorityColor = PRIORITY_COLORS[item.priority]
  const dueBadge = getDueBadge(item.due_date, item.status === 'completed')
  const assignee = item.assigned_to ? persons.find((p) => p.id === item.assigned_to) : null
  const isCompleted = item.status === 'completed'

  return (
    <div
      className={`flex items-center gap-2.5 py-2.5 px-3 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer ${isCompleted ? 'opacity-40' : ''}`}
      style={{ borderLeftWidth: priorityColor ? 3 : 0, borderLeftColor: priorityColor ?? undefined }}
      onClick={() => onClick(item)}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isCompleted}
          onCheckedChange={() => onToggle(item)}
        />
      </div>
      <div className="flex-1 min-w-0">
        <span className={`text-sm font-medium ${isCompleted ? 'line-through' : ''}`}>
          {item.title}
        </span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {dueBadge && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${dueBadge.className}`}>
            {dueBadge.label}
          </span>
        )}
        {assignee && (
          <div
            className={`w-5 h-5 rounded-full ${getMemberBgClass(assignee.id)} flex items-center justify-center text-[9px] font-semibold text-white`}
          >
            {(assignee.display_name || '?')[0].toUpperCase()}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/todos/todo-item-row.tsx
git commit -m "feat(todos): add todo item row with priority border and due badge"
```

### Task 11: Todo Item Dialog (Task Edit)

**Files:**
- Create: `src/components/features/todos/todo-item-dialog.tsx`

- [ ] **Step 1: Write the task edit dialog**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Trash2 } from 'lucide-react'
import { PRIORITIES } from '@/types/todos'
import type { TodoItem, TodoPriority } from '@/types/todos'

interface Person {
  id: string
  display_name: string | null
}

interface TodoItemDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: TodoItem | null
  persons: Person[]
  onSave: (data: {
    title: string
    description: string | null
    priority: TodoPriority
    due_date: string | null
    assigned_to: string | null
  }) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

export function TodoItemDialog({
  open,
  onOpenChange,
  item,
  persons,
  onSave,
  onDelete,
}: TodoItemDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TodoPriority>('none')
  const [dueDate, setDueDate] = useState('')
  const [assignedTo, setAssignedTo] = useState('none')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (open && item) {
      setTitle(item.title)
      setDescription(item.description || '')
      setPriority(item.priority)
      setDueDate(item.due_date || '')
      setAssignedTo(item.assigned_to || 'none')
    }
  }, [open, item])

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        due_date: dueDate || null,
        assigned_to: assignedTo === 'none' ? null : assignedTo,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!item || !onDelete) return
    if (!confirm('Delete this task?')) return
    setDeleting(true)
    try {
      await onDelete(item.id)
      onOpenChange(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-desc">Description</Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details..."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TodoPriority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-due">Due Date</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Assigned To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {persons.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.display_name || 'Unknown'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          {item && onDelete && (
            <Button variant="outline" onClick={handleDelete} disabled={deleting} className="text-destructive mr-auto">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/todos/todo-item-dialog.tsx
git commit -m "feat(todos): add todo item edit dialog"
```

### Task 12: Todo Detail Component

**Files:**
- Create: `src/components/features/todos/todo-detail.tsx`

- [ ] **Step 1: Write the list detail client component**

This is the main component for the list detail page. Manages tasks, quick add, overflow menu, and edit dialogs.

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ArrowLeft, MoreVertical, Plus, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { TodoItemRow } from './todo-item-row'
import { TodoItemDialog } from './todo-item-dialog'
import { TodoListDialog } from './todo-list-dialog'
import type { TodoList, TodoItem, TodoPriority, TodoListType } from '@/types/todos'

interface Person {
  id: string
  display_name: string | null
}

interface TodoDetailProps {
  list: TodoList & { todo_items: TodoItem[] }
  persons: Person[]
}

export function TodoDetail({ list: initialList, persons }: TodoDetailProps) {
  const router = useRouter()
  const [list, setList] = useState(initialList)
  const [items, setItems] = useState<TodoItem[]>(initialList.todo_items || [])
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<TodoItem | null>(null)
  const [listDialogOpen, setListDialogOpen] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)

  const pendingItems = items.filter((i) => i.status !== 'completed')
  const completedItems = items.filter((i) => i.status === 'completed')

  const defaultAssignee = list.default_assigned_to
    ? persons.find((p) => p.id === list.default_assigned_to)
    : null
  const typeLabel = list.list_type.charAt(0).toUpperCase() + list.list_type.slice(1)
  const progress = `${completedItems.length}/${items.length} done`

  // Quick add
  const handleQuickAdd = async () => {
    if (!newTaskTitle.trim()) return
    setAdding(true)
    try {
      const res = await fetch(`/api/todos/${list.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTaskTitle.trim() }),
      })
      if (res.ok) {
        const created = await res.json()
        setItems((prev) => [...prev, created])
        setNewTaskTitle('')
      }
    } finally {
      setAdding(false)
    }
  }

  // Toggle status
  const handleToggle = async (item: TodoItem) => {
    const newStatus = item.status === 'completed' ? 'pending' : 'completed'
    const previousItems = items
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null } : i))
    )
    try {
      const res = await fetch(`/api/todos/${list.id}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) setItems(previousItems)
    } catch {
      setItems(previousItems)
    }
  }

  // Edit task
  const handleSaveItem = async (data: {
    title: string
    description: string | null
    priority: TodoPriority
    due_date: string | null
    assigned_to: string | null
  }) => {
    if (!editingItem) return
    const res = await fetch(`/api/todos/${list.id}/items/${editingItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) {
      const updated = await res.json()
      setItems((prev) => prev.map((i) => (i.id === editingItem.id ? updated : i)))
    }
  }

  // Delete task
  const handleDeleteItem = async (id: string) => {
    const res = await fetch(`/api/todos/${list.id}/items/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== id))
    }
  }

  // List actions
  const handleEditList = async (data: {
    title: string
    list_type: TodoListType
    color: string | null
    default_assigned_to: string | null
  }) => {
    // Strip list_type — not mutable after creation
    const { list_type: _, ...updateData } = data
    const res = await fetch(`/api/todos/${list.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    })
    if (res.ok) {
      const updated = await res.json()
      setList(updated)
    }
  }

  const handlePin = async () => {
    const res = await fetch(`/api/todos/${list.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !list.pinned }),
    })
    if (res.ok) setList((prev) => ({ ...prev, pinned: !prev.pinned }))
  }

  const handleArchive = async () => {
    const res = await fetch(`/api/todos/${list.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    })
    if (res.ok) {
      router.push('/todos')
      router.refresh()
    }
  }

  const handleDeleteList = async () => {
    if (!confirm('Delete this list and all its tasks?')) return
    const res = await fetch(`/api/todos/${list.id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/todos')
      router.refresh()
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Link href="/todos">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {list.color && (
              <div className="w-1 h-6 rounded" style={{ background: list.color }} />
            )}
            <h1 className="text-xl font-bold truncate">{list.title}</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            {typeLabel}
            {defaultAssignee ? ` · ${defaultAssignee.display_name}` : ''}
            {' · '}{progress}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setListDialogOpen(true)}>Edit list</DropdownMenuItem>
            <DropdownMenuItem onClick={handlePin}>
              {list.pinned ? 'Unpin' : 'Pin'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleArchive}>Archive</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={handleDeleteList}>
              Delete list
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Quick add */}
      <div className="flex gap-2">
        <Input
          placeholder="Add a task..."
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
        />
        <Button onClick={handleQuickAdd} disabled={adding || !newTaskTitle.trim()}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>

      {/* Pending tasks */}
      <div>
        {pendingItems.length === 0 && completedItems.length === 0 && (
          <p className="text-muted-foreground text-sm py-8 text-center">No tasks yet</p>
        )}
        {pendingItems.length > 0 && (
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
        )}
      </div>

      {/* Completed tasks (collapsible) */}
      {completedItems.length > 0 && (
        <div>
          <button
            className="text-xs font-medium text-muted-foreground uppercase mb-1 hover:text-foreground"
            onClick={() => setShowCompleted(!showCompleted)}
          >
            {showCompleted ? '▾' : '▸'} Completed ({completedItems.length})
          </button>
          {showCompleted && (
            <div className="border rounded-lg overflow-hidden">
              {completedItems.map((item) => (
                <TodoItemRow
                  key={item.id}
                  item={item}
                  persons={persons}
                  onToggle={handleToggle}
                  onClick={(i) => { setEditingItem(i); setEditDialogOpen(true) }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Task edit dialog */}
      <TodoItemDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        item={editingItem}
        persons={persons}
        onSave={handleSaveItem}
        onDelete={handleDeleteItem}
      />

      {/* List edit dialog */}
      <TodoListDialog
        open={listDialogOpen}
        onOpenChange={setListDialogOpen}
        list={list}
        persons={persons}
        onSave={handleEditList}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/todos/todo-detail.tsx
git commit -m "feat(todos): add todo detail component with tasks, quick add, and overflow menu"
```

### Task 13: Todo Detail Page (Server Component)

**Files:**
- Create: `src/app/(dashboard)/todos/[id]/page.tsx`

- [ ] **Step 1: Write the detail server page**

```typescript
import { createClient } from '@/lib/supabase/server'
import { TodoDetail } from '@/components/features/todos/todo-detail'
import { notFound } from 'next/navigation'

export default async function TodoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: list, error } = await supabase
    .from('todo_lists')
    .select(`
      *,
      todo_items(*)
    `)
    .eq('id', id)
    .neq('list_type', 'shopping')
    .order('sort_order', { referencedTable: 'todo_items', ascending: true })
    .single()

  if (error || !list) notFound()

  // Fetch household persons for assignee picker
  const { data: persons } = await supabase
    .from('household_persons')
    .select('id, display_name')
    .eq('household_id', list.household_id)

  return <TodoDetail list={list as any} persons={persons || []} />
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\\(dashboard\\)/todos/\\[id\\]/page.tsx
git commit -m "feat(todos): add todo detail server page"
```

### Task 14: Smoke Test — Build Verification

- [ ] **Step 1: Verify the app builds**

Run: `npx next build 2>&1 | tail -30`

Fix any type errors. The likely issue is the same as inventory — `default_assigned_to` and `updated_at` columns not in generated Supabase types. The server pages already use `(supabase as any)` or `as any` casts where needed. API routes may need similar casts.

- [ ] **Step 2: Apply type casts to API routes if needed**

If build fails on `.from('todo_lists')` calls in the API routes (unlikely since `todo_lists` is already in the generated types, but the new columns may cause issues on `.select('*')`), add `(supabase as any)` casts as was done for inventory routes.

- [ ] **Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix(todos): build fixes for todos feature"
```
