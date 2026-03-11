# Calendar Phase A Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared household calendar with month view (default), week view, and event CRUD with Amalfi category colors, multi-day events, and person assignment.

**Architecture:** New `calendar_events` table with RLS. API routes in `src/app/api/calendar/`. Date utility functions in `src/lib/utils/calendar.ts`. Calendar view components in `src/components/features/calendar/` — month-grid and week-grid are separate focused components composed by a parent calendar-view. Server component page at `src/app/(dashboard)/calendar/page.tsx`.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + RLS), shadcn/ui, Tailwind CSS, TypeScript. No external date library.

**Spec:** `docs/superpowers/specs/2026-03-11-calendar-phase-a-design.md`

---

## File Structure

### New Files
- `supabase/migrations/00014_calendar_events.sql` — Table, indexes, RLS, trigger
- `src/types/calendar.ts` — CalendarEvent, EventCategory, category colors
- `src/lib/utils/calendar.ts` — Date utility functions (grid computation, event overlap, formatting)
- `src/app/api/calendar/route.ts` — GET (range query) + POST (create)
- `src/app/api/calendar/[id]/route.ts` — PUT (update) + DELETE
- `src/components/features/calendar/event-pill.tsx` — Month view event pill
- `src/components/features/calendar/event-block.tsx` — Week view timed event block
- `src/components/features/calendar/event-dialog.tsx` — Create/edit event dialog
- `src/components/features/calendar/month-grid.tsx` — Month grid with day cells and event rendering
- `src/components/features/calendar/week-grid.tsx` — Week time grid with all-day bar
- `src/components/features/calendar/calendar-view.tsx` — Main component: view toggle, navigation, state

### Modified Files
- `src/app/(dashboard)/calendar/page.tsx` — Replace stub with server component

---

## Chunk 1: Database + Types + API + Date Utils

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00014_calendar_events.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration: 00014_calendar_events.sql
-- Calendar events table for household calendar

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null,
  description text,
  start_datetime timestamptz not null,
  end_datetime timestamptz not null,
  all_day boolean not null default false,
  location text,
  assigned_to uuid[] not null default '{}',
  created_by uuid not null references public.profiles(id),
  category text not null check (category in ('chore', 'appointment', 'birthday', 'holiday', 'social', 'custom')),
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_datetime > start_datetime)
);

create index idx_calendar_events_household on public.calendar_events(household_id);
create index idx_calendar_events_date_range on public.calendar_events(household_id, start_datetime, end_datetime);
create index idx_calendar_events_assigned on public.calendar_events using gin (assigned_to);

create trigger calendar_events_updated_at
  before update on public.calendar_events
  for each row execute function public.update_updated_at();

alter table public.calendar_events enable row level security;

create policy "household_read" on public.calendar_events
  for select using (household_id in (select public.get_my_household_ids()));

create policy "household_insert" on public.calendar_events
  for insert with check (household_id in (select public.get_my_household_ids()));

create policy "household_update" on public.calendar_events
  for update using (household_id in (select public.get_my_household_ids()));

create policy "household_delete" on public.calendar_events
  for delete using (household_id in (select public.get_my_household_ids()));
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/00014_calendar_events.sql
git commit -m "feat(calendar): add calendar_events table with RLS"
```

### Task 2: TypeScript Types

**Files:**
- Create: `src/types/calendar.ts`

- [ ] **Step 1: Create types file**

```typescript
export interface CalendarEvent {
  id: string
  household_id: string
  title: string
  description: string | null
  start_datetime: string
  end_datetime: string
  all_day: boolean
  location: string | null
  assigned_to: string[]
  created_by: string
  category: EventCategory
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type EventCategory = 'chore' | 'appointment' | 'birthday' | 'holiday' | 'social' | 'custom'

export const EVENT_CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: 'appointment', label: 'Appointment' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'chore', label: 'Chore' },
  { value: 'social', label: 'Social' },
  { value: 'custom', label: 'Custom' },
]

export const CATEGORY_COLORS: Record<EventCategory, string> = {
  appointment: '#4A90A4',
  birthday: '#C97BB6',
  holiday: '#F2CC8F',
  chore: '#81B29A',
  social: '#E8A87C',
  custom: '#3D405B',
}

export const VALID_CATEGORIES = new Set<string>(EVENT_CATEGORIES.map((c) => c.value))
```

Note: `end_datetime` is `string` (not `string | null`) and `NOT NULL` in the migration. The spec mentions nullable but we tightened this — always storing both start and end for consistent query patterns (no NULL branch needed in range queries).

- [ ] **Step 2: Commit**

```bash
git add src/types/calendar.ts
git commit -m "feat(calendar): add TypeScript types, category colors"
```

### Task 3: Date Utility Functions

**Files:**
- Create: `src/lib/utils/calendar.ts`

- [ ] **Step 1: Write date utilities**

These functions are used by both month-grid and week-grid components. All operate on plain JS Date objects.

```typescript
/**
 * Calendar date utilities. No external library.
 * All functions assume Monday = start of week.
 */

/** Get the Monday of the week containing the given date. */
export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  // JS: Sunday=0, Monday=1. We want Monday=0.
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

/** Get the Sunday (end of week) for the week containing the given date. */
export function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return end
}

/** Get the first day to show in a month grid (Monday of the week containing the 1st). */
export function getMonthGridStart(year: number, month: number): Date {
  const firstOfMonth = new Date(year, month, 1)
  return getWeekStart(firstOfMonth)
}

/** Get the last day to show in a month grid (Sunday of the week containing the last day). */
export function getMonthGridEnd(year: number, month: number): Date {
  const lastOfMonth = new Date(year, month + 1, 0) // Last day of month
  const end = getWeekEnd(lastOfMonth)
  return end
}

/** Generate all dates for a month grid (42 days = 6 weeks, or 35 = 5 weeks). */
export function getMonthGridDays(year: number, month: number): Date[] {
  const start = getMonthGridStart(year, month)
  const end = getMonthGridEnd(year, month)
  const days: Date[] = []
  const current = new Date(start)
  while (current <= end) {
    days.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return days
}

/** Check if two dates are the same calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

/** Check if a date is today. */
export function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

/** Format a date as "March 2026" for month header. */
export function formatMonthYear(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

/** Format a week range as "Mar 9 – 15" or "Mar 28 – Apr 3" for week header. */
export function formatWeekRange(start: Date, end: Date): string {
  const startMonth = start.toLocaleDateString('en-GB', { month: 'short' })
  const endMonth = end.toLocaleDateString('en-GB', { month: 'short' })
  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()} – ${end.getDate()}`
  }
  return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}`
}

/** Format time as "9am", "2:30pm", etc. */
export function formatTime(date: Date): string {
  const h = date.getHours()
  const m = date.getMinutes()
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${suffix}` : `${hour}:${m.toString().padStart(2, '0')}${suffix}`
}

/**
 * Check if an event overlaps a specific day.
 * Uses exclusive-end convention: event spans [start, end).
 */
export function eventOverlapsDay(event: { start_datetime: string; end_datetime: string }, day: Date): boolean {
  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const eventStart = new Date(event.start_datetime)
  const eventEnd = new Date(event.end_datetime)

  return eventStart < dayEnd && eventEnd > dayStart
}

/**
 * Get events for a specific day from a list.
 */
export function getEventsForDay(events: { start_datetime: string; end_datetime: string }[], day: Date) {
  return events.filter((e) => eventOverlapsDay(e, day))
}

/**
 * Check if an event spans multiple days.
 */
export function isMultiDay(event: { start_datetime: string; end_datetime: string; all_day: boolean }): boolean {
  const start = new Date(event.start_datetime)
  const end = new Date(event.end_datetime)
  // For all-day events: multi-day if end is more than 1 day after start
  if (event.all_day) {
    const diffMs = end.getTime() - start.getTime()
    return diffMs > 24 * 60 * 60 * 1000
  }
  // For timed events: multi-day if they span different calendar days
  return start.toDateString() !== end.toDateString()
}

/** Get the date range for API queries covering the full visible month grid. Returns ISO strings. */
export function getMonthRange(year: number, month: number): { start: string; end: string } {
  const gridStart = getMonthGridStart(year, month)
  const gridEnd = getMonthGridEnd(year, month)
  // Exclusive end: day after grid end
  const end = new Date(gridEnd)
  end.setDate(end.getDate() + 1)
  return {
    start: gridStart.toISOString(),
    end: end.toISOString(),
  }
}

export function getWeekRange(weekStart: Date): { start: string; end: string } {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 7)
  return {
    start: weekStart.toISOString(),
    end: end.toISOString(),
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/utils/calendar.ts
git commit -m "feat(calendar): add date utility functions"
```

### Task 4: API Routes — GET + POST

**Files:**
- Create: `src/app/api/calendar/route.ts`

- [ ] **Step 1: Write GET (range query) and POST (create event)**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { VALID_CATEGORIES } from '@/types/calendar'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const householdId = url.searchParams.get('householdId')
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')

  if (!householdId || !start || !end) {
    return NextResponse.json({ error: 'householdId, start, and end are required' }, { status: 400 })
  }

  // Range overlap query: events where [start_datetime, end_datetime) overlaps [start, end)
  const { data, error } = await (supabase as any)
    .from('calendar_events')
    .select('*')
    .eq('household_id', householdId)
    .lt('start_datetime', end)
    .gt('end_datetime', start)
    .order('start_datetime', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { household_id, title, description, start_datetime, end_datetime, all_day, location, assigned_to, category, metadata } = body

  if (!household_id || !title?.trim() || !start_datetime || !end_datetime) {
    return NextResponse.json({ error: 'household_id, title, start_datetime, and end_datetime are required' }, { status: 400 })
  }
  if (!category || !VALID_CATEGORIES.has(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  }
  if (new Date(end_datetime) <= new Date(start_datetime)) {
    return NextResponse.json({ error: 'end_datetime must be after start_datetime' }, { status: 400 })
  }

  const { data, error } = await (supabase as any)
    .from('calendar_events')
    .insert({
      household_id,
      title: title.trim(),
      description: description ?? null,
      start_datetime,
      end_datetime,
      all_day: all_day ?? false,
      location: location ?? null,
      assigned_to: assigned_to ?? [],
      created_by: user.id,
      category,
      metadata: metadata ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/calendar/route.ts
git commit -m "feat(calendar): add GET (range query) and POST API routes"
```

### Task 5: API Routes — PUT + DELETE

**Files:**
- Create: `src/app/api/calendar/[id]/route.ts`

- [ ] **Step 1: Write PUT and DELETE**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { VALID_CATEGORIES } from '@/types/calendar'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}

  if ('title' in body) {
    if (!body.title?.trim()) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
    updates.title = body.title.trim()
  }
  if ('description' in body) updates.description = body.description ?? null
  if ('start_datetime' in body) updates.start_datetime = body.start_datetime
  if ('end_datetime' in body) updates.end_datetime = body.end_datetime
  if ('all_day' in body) updates.all_day = body.all_day
  if ('location' in body) updates.location = body.location ?? null
  if ('assigned_to' in body) updates.assigned_to = body.assigned_to ?? []
  if ('category' in body) {
    if (!VALID_CATEGORIES.has(body.category)) return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    updates.category = body.category
  }
  if ('metadata' in body) updates.metadata = body.metadata ?? null

  // Validate end > start if both are being updated
  if (updates.start_datetime && updates.end_datetime) {
    if (new Date(updates.end_datetime as string) <= new Date(updates.start_datetime as string)) {
      return NextResponse.json({ error: 'end_datetime must be after start_datetime' }, { status: 400 })
    }
  }

  const { data, error } = await (supabase as any)
    .from('calendar_events')
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

  const { error } = await (supabase as any).from('calendar_events').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/calendar/\\[id\\]/route.ts
git commit -m "feat(calendar): add PUT and DELETE API routes"
```

---

## Chunk 2: Event Dialog + Event Rendering Components

### Task 6: Event Dialog (Create/Edit)

**Files:**
- Create: `src/components/features/calendar/event-dialog.tsx`

- [ ] **Step 1: Write the event dialog**

This dialog handles both create and edit. Fields adapt based on all-day toggle. Multi-select for assignees.

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
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
import { EVENT_CATEGORIES, CATEGORY_COLORS } from '@/types/calendar'
import type { CalendarEvent, EventCategory } from '@/types/calendar'

interface Person {
  id: string
  display_name: string | null
}

interface EventDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: CalendarEvent | null // null = creating
  defaultDate?: string // ISO date for pre-fill
  defaultTime?: string // HH:MM for pre-fill (week view click)
  defaultAllDay?: boolean
  persons: Person[]
  onSave: (data: {
    title: string
    description: string | null
    start_datetime: string
    end_datetime: string
    all_day: boolean
    location: string | null
    assigned_to: string[]
    category: EventCategory
  }) => Promise<void>
  onDelete?: (id: string) => Promise<void>
}

export function EventDialog({
  open,
  onOpenChange,
  event,
  defaultDate,
  defaultTime,
  defaultAllDay,
  persons,
  onSave,
  onDelete,
}: EventDialogProps) {
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<EventCategory>('custom')
  const [allDay, setAllDay] = useState(true)
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('10:00')
  const [assignedTo, setAssignedTo] = useState<string[]>([])
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!open) return
    if (event) {
      setTitle(event.title)
      setCategory(event.category)
      setAllDay(event.all_day)
      const start = new Date(event.start_datetime)
      const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
      setStartDate(startStr)
      setStartTime(start.toTimeString().slice(0, 5))
      const end = new Date(event.end_datetime)
      if (event.all_day) {
        // Exclusive end: subtract 1 day for display
        const displayEnd = new Date(end)
        displayEnd.setDate(displayEnd.getDate() - 1)
        const endStr = `${displayEnd.getFullYear()}-${String(displayEnd.getMonth() + 1).padStart(2, '0')}-${String(displayEnd.getDate()).padStart(2, '0')}`
        setEndDate(endStr === startStr ? '' : endStr)
      } else {
        const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`
        setEndDate(endStr)
        setEndTime(end.toTimeString().slice(0, 5))
      }
      setAssignedTo(event.assigned_to || [])
      setLocation(event.location || '')
      setDescription(event.description || '')
    } else {
      setTitle('')
      setCategory('custom')
      setAllDay(defaultAllDay ?? true)
      setStartDate(defaultDate || new Date().toISOString().split('T')[0])
      setStartTime(defaultTime || '09:00')
      setEndDate('')
      setEndTime(defaultTime ? incrementHour(defaultTime) : '10:00')
      setAssignedTo([])
      setLocation('')
      setDescription('')
    }
  }, [open, event, defaultDate, defaultTime, defaultAllDay])

  function incrementHour(time: string): string {
    const [h, m] = time.split(':').map(Number)
    return `${String(Math.min(h + 1, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      let startDt: string
      let endDt: string

      if (allDay) {
        startDt = new Date(startDate + 'T00:00:00Z').toISOString()
        // Exclusive end: day after the end date (or day after start if no end date)
        const lastDay = endDate || startDate
        const endDay = new Date(lastDay + 'T00:00:00Z')
        endDay.setUTCDate(endDay.getUTCDate() + 1)
        endDt = endDay.toISOString()
      } else {
        startDt = new Date(`${startDate}T${startTime}`).toISOString()
        const ed = endDate || startDate
        endDt = new Date(`${ed}T${endTime}`).toISOString()
      }

      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        start_datetime: startDt,
        end_datetime: endDt,
        all_day: allDay,
        location: location.trim() || null,
        assigned_to: assignedTo,
        category,
      })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!event || !onDelete) return
    if (!confirm('Delete this event?')) return
    setDeleting(true)
    try {
      await onDelete(event.id)
      onOpenChange(false)
    } finally {
      setDeleting(false)
    }
  }

  const togglePerson = (personId: string) => {
    setAssignedTo((prev) =>
      prev.includes(personId) ? prev.filter((id) => id !== personId) : [...prev, personId]
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{event ? 'Edit Event' : 'New Event'}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="event-title">Title</Label>
            <Input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Dentist appointment"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as EventCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EVENT_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[c.value] }} />
                      {c.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="all-day"
              checked={allDay}
              onCheckedChange={(checked) => setAllDay(checked === true)}
            />
            <Label htmlFor="all-day" className="font-normal">All day</Label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            {!allDay && (
              <div className="space-y-2">
                <Label htmlFor="start-time">Start Time</Label>
                <Input
                  id="start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder={startDate}
              />
            </div>
            {!allDay && (
              <div className="space-y-2">
                <Label htmlFor="end-time">End Time</Label>
                <Input
                  id="end-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            )}
          </div>

          {persons.length > 0 && (
            <div className="space-y-2">
              <Label>Assigned To</Label>
              <div className="flex gap-2 flex-wrap">
                {persons.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      assignedTo.includes(p.id)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border hover:bg-muted'
                    }`}
                    onClick={() => togglePerson(p.id)}
                  >
                    {p.display_name || 'Unknown'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="event-location">Location</Label>
            <Input
              id="event-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="event-desc">Description</Label>
            <Textarea
              id="event-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter className="flex justify-between">
          {event && onDelete && (
            <Button variant="outline" onClick={handleDelete} disabled={deleting} className="text-destructive mr-auto">
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
              Delete
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            {event ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/calendar/event-dialog.tsx
git commit -m "feat(calendar): add event create/edit dialog"
```

### Task 7: Event Pill Component (Month View)

**Files:**
- Create: `src/components/features/calendar/event-pill.tsx`

- [ ] **Step 1: Write the event pill**

Small colored pill for month grid day cells. Shows time prefix for timed events.

```typescript
'use client'

import { CATEGORY_COLORS } from '@/types/calendar'
import { formatTime } from '@/lib/utils/calendar'
import type { CalendarEvent } from '@/types/calendar'

interface EventPillProps {
  event: CalendarEvent
  onClick: (event: CalendarEvent) => void
  isMultiDaySegment?: boolean // true if this is part of a multi-day bar
}

export function EventPill({ event, onClick, isMultiDaySegment }: EventPillProps) {
  const color = CATEGORY_COLORS[event.category]
  const timePrefix = !event.all_day ? formatTime(new Date(event.start_datetime)) + ' ' : ''
  const isDark = event.category === 'twilight' || event.category === 'custom'

  return (
    <button
      className="w-full text-left px-1.5 py-0.5 rounded text-[10px] leading-tight truncate cursor-pointer hover:opacity-80"
      style={{
        background: color,
        color: event.category === 'holiday' ? '#333' : '#fff',
        borderRadius: isMultiDaySegment ? 0 : undefined,
      }}
      onClick={(e) => {
        e.stopPropagation()
        onClick(event)
      }}
      title={event.title}
    >
      {timePrefix}{event.title}
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/calendar/event-pill.tsx
git commit -m "feat(calendar): add event pill component for month view"
```

### Task 8: Event Block Component (Week View)

**Files:**
- Create: `src/components/features/calendar/event-block.tsx`

- [ ] **Step 1: Write the timed event block**

Absolutely positioned block for the week time grid. Height based on duration, top based on start time.

```typescript
'use client'

import { CATEGORY_COLORS } from '@/types/calendar'
import { formatTime } from '@/lib/utils/calendar'
import type { CalendarEvent } from '@/types/calendar'

interface EventBlockProps {
  event: CalendarEvent
  onClick: (event: CalendarEvent) => void
  /** Pixels per hour in the time grid */
  hourHeight: number
  /** Fraction of column width (for overlapping events): 0-1 */
  widthFraction?: number
  /** Offset index for overlapping events */
  offsetIndex?: number
}

export function EventBlock({
  event,
  onClick,
  hourHeight,
  widthFraction = 1,
  offsetIndex = 0,
}: EventBlockProps) {
  const color = CATEGORY_COLORS[event.category]
  const start = new Date(event.start_datetime)
  const end = new Date(event.end_datetime)

  const startMinutes = start.getHours() * 60 + start.getMinutes()
  const durationMinutes = (end.getTime() - start.getTime()) / (1000 * 60)
  const minHeight = hourHeight / 2 // minimum 30 min height

  const top = (startMinutes / 60) * hourHeight
  const height = Math.max((durationMinutes / 60) * hourHeight, minHeight)
  const width = `${widthFraction * 100}%`
  const left = `${offsetIndex * widthFraction * 100}%`

  return (
    <button
      className="absolute rounded px-1.5 py-0.5 text-[10px] overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
      style={{
        top: `${top}px`,
        height: `${height}px`,
        width,
        left,
        background: color,
        color: event.category === 'holiday' ? '#333' : '#fff',
      }}
      onClick={(e) => {
        e.stopPropagation()
        onClick(event)
      }}
    >
      <div className="font-semibold truncate">{event.title}</div>
      <div className="opacity-80">{formatTime(start)} – {formatTime(end)}</div>
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/calendar/event-block.tsx
git commit -m "feat(calendar): add event block component for week view"
```

---

## Chunk 3: Month Grid + Week Grid

### Task 9: Month Grid Component

**Files:**
- Create: `src/components/features/calendar/month-grid.tsx`

- [ ] **Step 1: Write the month grid**

This is the core month view rendering. It generates the day grid, places event pills, handles multi-day event bars, and manages overflow ("+N more").

```typescript
'use client'

import { useMemo } from 'react'
import { getMonthGridDays, isToday, eventOverlapsDay, isMultiDay } from '@/lib/utils/calendar'
import { EventPill } from './event-pill'
import type { CalendarEvent } from '@/types/calendar'

interface MonthGridProps {
  year: number
  month: number
  events: CalendarEvent[]
  onDayClick: (date: Date) => void
  onEventClick: (event: CalendarEvent) => void
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_VISIBLE_EVENTS = 3

export function MonthGrid({ year, month, events, onDayClick, onEventClick }: MonthGridProps) {
  const days = useMemo(() => getMonthGridDays(year, month), [year, month])

  const dayEvents = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const day of days) {
      const key = day.toISOString().split('T')[0]
      const dayEvts = events
        .filter((e) => eventOverlapsDay(e, day))
        .sort((a, b) => {
          // Multi-day and all-day events first, then by start time
          const aMulti = isMultiDay(a) || a.all_day ? 0 : 1
          const bMulti = isMultiDay(b) || b.all_day ? 0 : 1
          if (aMulti !== bMulti) return aMulti - bMulti
          return new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
        })
      map.set(key, dayEvts)
    }
    return map
  }, [days, events])

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b">
        {DAY_NAMES.map((name) => (
          <div key={name} className="py-1.5 text-center text-xs font-semibold text-muted-foreground">
            {name}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const key = day.toISOString().split('T')[0]
          const evts = dayEvents.get(key) || []
          const isCurrentMonth = day.getMonth() === month
          const today = isToday(day)
          const visible = evts.slice(0, MAX_VISIBLE_EVENTS)
          const overflow = evts.length - MAX_VISIBLE_EVENTS

          return (
            <div
              key={key}
              className={`min-h-[80px] border-b border-r p-1 cursor-pointer hover:bg-muted/30 transition-colors ${
                !isCurrentMonth ? 'opacity-30' : ''
              } ${i % 7 === 0 ? 'border-l' : ''}`}
              onClick={() => onDayClick(day)}
            >
              <div className="flex justify-between items-start">
                <span
                  className={`text-xs inline-flex items-center justify-center ${
                    today
                      ? 'bg-primary text-primary-foreground w-5 h-5 rounded-full font-bold'
                      : 'font-medium'
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
              <div className="mt-0.5 space-y-0.5">
                {visible.map((evt) => (
                  <EventPill key={evt.id} event={evt} onClick={onEventClick} />
                ))}
                {overflow > 0 && (
                  <button
                    className="text-[10px] text-muted-foreground hover:text-foreground px-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      // For Phase A, just clicking the day is enough to see all events
                      onDayClick(day)
                    }}
                  >
                    +{overflow} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

Note: Multi-day event spanning (bar rendering across cells) is complex CSS. For Phase A, multi-day events show as a pill on each day they span. Multi-day bar rendering can be added as a visual enhancement later — the data model supports it but the rendering is non-trivial and the per-day pill approach is functional.

- [ ] **Step 2: Commit**

```bash
git add src/components/features/calendar/month-grid.tsx
git commit -m "feat(calendar): add month grid component"
```

### Task 10: Week Grid Component

**Files:**
- Create: `src/components/features/calendar/week-grid.tsx`

- [ ] **Step 1: Write the week time grid**

Time grid with all-day bar, hourly rows, and positioned event blocks. Handles overlapping events.

```typescript
'use client'

import { useMemo, useRef, useEffect } from 'react'
import { getWeekStart, isSameDay, eventOverlapsDay, formatTime } from '@/lib/utils/calendar'
import { EventPill } from './event-pill'
import { EventBlock } from './event-block'
import type { CalendarEvent } from '@/types/calendar'

interface WeekGridProps {
  weekStart: Date
  events: CalendarEvent[]
  onSlotClick: (date: Date, hour: number) => void
  onEventClick: (event: CalendarEvent) => void
}

const HOUR_HEIGHT = 48
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function WeekGrid({ weekStart, events, onSlotClick, onEventClick }: WeekGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Generate 7 days for this week
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [weekStart])

  // Split events into all-day and timed
  const { allDayEvents, timedEvents } = useMemo(() => {
    const allDay: CalendarEvent[] = []
    const timed: CalendarEvent[] = []
    for (const evt of events) {
      if (evt.all_day) {
        allDay.push(evt)
      } else {
        timed.push(evt)
      }
    }
    return { allDayEvents: allDay, timedEvents: timed }
  }, [events])

  // Get timed events per day with overlap computation
  const timedByDay = useMemo(() => {
    return days.map((day) => {
      const dayEvts = timedEvents
        .filter((e) => eventOverlapsDay(e, day))
        .sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime())

      // Compute overlaps: group events that overlap each other.
      // Note: this greedy grouping may over-narrow non-overlapping events within transitive groups.
      // Acceptable simplification for Phase A.
      const positioned: { event: CalendarEvent; widthFraction: number; offsetIndex: number }[] = []
      const groups: CalendarEvent[][] = []

      for (const evt of dayEvts) {
        const evtStart = new Date(evt.start_datetime).getTime()
        const evtEnd = new Date(evt.end_datetime).getTime()

        // Find if this event overlaps with any existing group
        let placed = false
        for (const group of groups) {
          const overlaps = group.some((g) => {
            const gStart = new Date(g.start_datetime).getTime()
            const gEnd = new Date(g.end_datetime).getTime()
            return evtStart < gEnd && evtEnd > gStart
          })
          if (overlaps) {
            group.push(evt)
            placed = true
            break
          }
        }
        if (!placed) {
          groups.push([evt])
        }
      }

      // Assign width fractions and offsets
      for (const group of groups) {
        const width = 1 / group.length
        group.forEach((evt, idx) => {
          positioned.push({ event: evt, widthFraction: width, offsetIndex: idx })
        })
      }

      return positioned
    })
  }, [days, timedEvents])

  // Auto-scroll to 8am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 8 * HOUR_HEIGHT
    }
  }, [])

  const today = new Date()

  return (
    <div>
      {/* All-day bar */}
      {allDayEvents.length > 0 && (
        <div className="grid border-b" style={{ gridTemplateColumns: '50px repeat(7, 1fr)' }}>
          <div className="py-1 px-1 text-[10px] text-muted-foreground text-right">all-day</div>
          {days.map((day) => {
            const dayAllDay = allDayEvents.filter((e) => eventOverlapsDay(e, day))
            return (
              <div key={day.toISOString()} className="border-l py-1 px-0.5 space-y-0.5">
                {dayAllDay.map((evt) => (
                  <EventPill key={evt.id} event={evt} onClick={onEventClick} />
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Day headers */}
      <div className="grid border-b" style={{ gridTemplateColumns: '50px repeat(7, 1fr)' }}>
        <div />
        {days.map((day, i) => {
          const isToday = isSameDay(day, today)
          return (
            <div key={day.toISOString()} className="border-l py-1.5 text-center">
              <div className="text-[10px] text-muted-foreground">{DAY_NAMES[i]}</div>
              <div className={`text-base font-semibold inline-flex items-center justify-center ${
                isToday ? 'bg-primary text-primary-foreground w-7 h-7 rounded-full' : ''
              }`}>
                {day.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
        <div className="grid" style={{ gridTemplateColumns: '50px repeat(7, 1fr)' }}>
          {/* Hour labels column */}
          <div>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="text-[10px] text-muted-foreground text-right pr-1 border-b"
                style={{ height: HOUR_HEIGHT }}
              >
                {hour === 0 ? '' : `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`}
              </div>
            ))}
          </div>

          {/* Day columns — each is a relative container for absolute event blocks */}
          {days.map((day, dayIdx) => {
            const positioned = timedByDay[dayIdx]
            return (
              <div key={day.toISOString()} className="border-l relative">
                {/* Hour grid lines + click targets */}
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="border-b cursor-pointer hover:bg-muted/20"
                    style={{ height: HOUR_HEIGHT }}
                    onClick={() => onSlotClick(day, hour)}
                  />
                ))}
                {/* Event blocks overlaid on the column */}
                {positioned.map(({ event, widthFraction, offsetIndex }) => (
                  <EventBlock
                    key={event.id}
                    event={event}
                    onClick={onEventClick}
                    hourHeight={HOUR_HEIGHT}
                    widthFraction={widthFraction}
                    offsetIndex={offsetIndex}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

**Important note for implementers:** The absolute positioning of event blocks within the CSS grid is the trickiest part. The approach above uses a nested absolute position within each day cell. An alternative simpler approach: render event blocks inside each day cell's `onClick` div using relative positioning within the cell. This avoids the complex `calc()` positioning.

**Simpler alternative for the event blocks:** Instead of a global overlay, render event blocks inside each day column cell. Each hour cell already has `position: relative`. But since events span multiple hour cells, the blocks need to be in a container that spans the full day column height. The cleanest approach is to have a separate absolute overlay div for each day column that sits on top of the grid, sized to match the column.

The implementer should test and adjust the positioning approach during implementation. The key requirement is: events appear at the correct time position with correct height, and overlapping events share column width.

- [ ] **Step 2: Commit**

```bash
git add src/components/features/calendar/week-grid.tsx
git commit -m "feat(calendar): add week grid component with time slots and event blocks"
```

---

## Chunk 4: Main Calendar View + Server Page + Smoke Test

### Task 11: Calendar View (Main Component)

**Files:**
- Create: `src/components/features/calendar/calendar-view.tsx`

- [ ] **Step 1: Write the main calendar component**

Manages view state (month/week), navigation (prev/next/today), event fetching on navigation, and dialog state.

```typescript
'use client'

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { MonthGrid } from './month-grid'
import { WeekGrid } from './week-grid'
import { EventDialog } from './event-dialog'
import {
  formatMonthYear,
  formatWeekRange,
  getWeekStart,
  getWeekEnd,
  getMonthRange,
  getWeekRange,
} from '@/lib/utils/calendar'
import type { CalendarEvent, EventCategory } from '@/types/calendar'

interface Person {
  id: string
  display_name: string | null
}

interface CalendarViewProps {
  initialEvents: CalendarEvent[]
  householdId: string
  persons: Person[]
  initialYear: number
  initialMonth: number
}

type ViewMode = 'month' | 'week'

export function CalendarView({
  initialEvents,
  householdId,
  persons,
  initialYear,
  initialMonth,
}: CalendarViewProps) {
  const [view, setView] = useState<ViewMode>('month')
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [defaultDate, setDefaultDate] = useState<string | undefined>()
  const [defaultTime, setDefaultTime] = useState<string | undefined>()
  const [defaultAllDay, setDefaultAllDay] = useState<boolean | undefined>()

  // Fetch events for a date range
  const fetchEvents = useCallback(async (start: string, end: string) => {
    const res = await fetch(
      `/api/calendar?householdId=${householdId}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    )
    if (res.ok) {
      const data = await res.json()
      setEvents(data)
    }
  }, [householdId])

  // Navigation
  const handlePrev = () => {
    if (view === 'month') {
      const newMonth = month === 0 ? 11 : month - 1
      const newYear = month === 0 ? year - 1 : year
      setMonth(newMonth)
      setYear(newYear)
      const range = getMonthRange(newYear, newMonth)
      fetchEvents(range.start, range.end)
    } else {
      const newStart = new Date(weekStart)
      newStart.setDate(newStart.getDate() - 7)
      setWeekStart(newStart)
      const range = getWeekRange(newStart)
      fetchEvents(range.start, range.end)
    }
  }

  const handleNext = () => {
    if (view === 'month') {
      const newMonth = month === 11 ? 0 : month + 1
      const newYear = month === 11 ? year + 1 : year
      setMonth(newMonth)
      setYear(newYear)
      const range = getMonthRange(newYear, newMonth)
      fetchEvents(range.start, range.end)
    } else {
      const newStart = new Date(weekStart)
      newStart.setDate(newStart.getDate() + 7)
      setWeekStart(newStart)
      const range = getWeekRange(newStart)
      fetchEvents(range.start, range.end)
    }
  }

  const handleToday = () => {
    const now = new Date()
    if (view === 'month') {
      setYear(now.getFullYear())
      setMonth(now.getMonth())
      const range = getMonthRange(now.getFullYear(), now.getMonth())
      fetchEvents(range.start, range.end)
    } else {
      const ws = getWeekStart(now)
      setWeekStart(ws)
      const range = getWeekRange(ws)
      fetchEvents(range.start, range.end)
    }
  }

  const handleViewChange = (newView: ViewMode) => {
    setView(newView)
    if (newView === 'week') {
      // Switch to week containing the first of the current month (or today if same month)
      const now = new Date()
      const target = now.getFullYear() === year && now.getMonth() === month
        ? now
        : new Date(year, month, 1)
      const ws = getWeekStart(target)
      setWeekStart(ws)
      const range = getWeekRange(ws)
      fetchEvents(range.start, range.end)
    } else {
      // Switch to month view — use current month state
      const range = getMonthRange(year, month)
      fetchEvents(range.start, range.end)
    }
  }

  // Event actions
  const openCreateDialog = (date?: Date, hour?: number) => {
    setEditingEvent(null)
    if (date) {
      setDefaultDate(date.toISOString().split('T')[0])
      if (hour !== undefined) {
        setDefaultTime(`${String(hour).padStart(2, '0')}:00`)
        setDefaultAllDay(false)
      } else {
        setDefaultTime(undefined)
        setDefaultAllDay(true)
      }
    } else {
      setDefaultDate(undefined)
      setDefaultTime(undefined)
      setDefaultAllDay(undefined)
    }
    setDialogOpen(true)
  }

  const openEditDialog = (event: CalendarEvent) => {
    setEditingEvent(event)
    setDialogOpen(true)
  }

  const handleSave = async (data: {
    title: string
    description: string | null
    start_datetime: string
    end_datetime: string
    all_day: boolean
    location: string | null
    assigned_to: string[]
    category: EventCategory
  }) => {
    if (editingEvent) {
      const res = await fetch(`/api/calendar/${editingEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (res.ok) {
        const updated = await res.json()
        setEvents((prev) => prev.map((e) => (e.id === editingEvent.id ? updated : e)))
      }
    } else {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ household_id: householdId, ...data }),
      })
      if (res.ok) {
        const created = await res.json()
        setEvents((prev) => [...prev, created])
      }
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/calendar/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setEvents((prev) => prev.filter((e) => e.id !== id))
    }
  }

  // Header text
  const headerText = view === 'month'
    ? formatMonthYear(year, month)
    : formatWeekRange(weekStart, getWeekEnd(weekStart))

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold">{headerText}</h1>
          <div className="flex gap-1">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={handlePrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleToday}>
            Today
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border rounded-md text-xs overflow-hidden">
            <button
              className={`px-2.5 py-1 ${view === 'month' ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'}`}
              onClick={() => handleViewChange('month')}
            >
              Month
            </button>
            <button
              className={`px-2.5 py-1 ${view === 'week' ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'}`}
              onClick={() => handleViewChange('week')}
            >
              Week
            </button>
          </div>
          <Button size="sm" className="h-7 text-xs" onClick={() => openCreateDialog()}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Event
          </Button>
        </div>
      </div>

      {/* View */}
      {view === 'month' ? (
        <MonthGrid
          year={year}
          month={month}
          events={events}
          onDayClick={(date) => openCreateDialog(date)}
          onEventClick={openEditDialog}
        />
      ) : (
        <WeekGrid
          weekStart={weekStart}
          events={events}
          onSlotClick={(date, hour) => openCreateDialog(date, hour)}
          onEventClick={openEditDialog}
        />
      )}

      {/* Event dialog */}
      <EventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        event={editingEvent}
        defaultDate={defaultDate}
        defaultTime={defaultTime}
        defaultAllDay={defaultAllDay}
        persons={persons}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/calendar/calendar-view.tsx
git commit -m "feat(calendar): add main calendar view with month/week toggle and navigation"
```

### Task 12: Calendar Page (Server Component)

**Files:**
- Modify: `src/app/(dashboard)/calendar/page.tsx`

- [ ] **Step 1: Replace the stub**

```typescript
import { createClient } from '@/lib/supabase/server'
import { CalendarView } from '@/components/features/calendar/calendar-view'
import { getMonthRange } from '@/lib/utils/calendar'

export default async function CalendarPage() {
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

  // Fetch current month's events
  const now = new Date()
  const { start, end } = getMonthRange(now.getFullYear(), now.getMonth())

  const { data: events } = await (supabase as any)
    .from('calendar_events')
    .select('*')
    .eq('household_id', householdId)
    .lt('start_datetime', end)
    .gt('end_datetime', start)
    .order('start_datetime', { ascending: true })

  // Fetch household persons for assignee picker
  const { data: persons } = await supabase
    .from('household_persons')
    .select('id, display_name')
    .eq('household_id', householdId)

  return (
    <CalendarView
      initialEvents={events || []}
      householdId={householdId}
      persons={persons || []}
      initialYear={now.getFullYear()}
      initialMonth={now.getMonth()}
    />
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\\(dashboard\\)/calendar/page.tsx
git commit -m "feat(calendar): replace stub page with server component"
```

### Task 13: Smoke Test — Build Verification

- [ ] **Step 1: Verify the app builds**

Run: `npx next build 2>&1 | tail -30`

Fix any type errors. Likely issues:
- `calendar_events` not in generated Supabase types — API routes and server page already use `(supabase as any)`
- Import path issues or missing exports

- [ ] **Step 2: Fix any build errors**

Apply `(supabase as any)` casts where needed, fix import paths.

- [ ] **Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix(calendar): build fixes for calendar feature"
```
