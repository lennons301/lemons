# Home Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home page stub with a dashboard showing today's events, tasks due, today's meals, expiring inventory, and a week-at-a-glance strip, with a Household/Just Me toggle.

**Architecture:** No new tables or API routes. Server component fetches all data from 4 existing tables via Supabase, passes to a client component that handles the toggle filter and renders widgets. Each widget is a small focused component.

**Tech Stack:** Next.js 14 App Router, Supabase, shadcn/ui, Tailwind CSS, TypeScript.

**Spec:** `docs/superpowers/specs/2026-03-11-home-dashboard-design.md`

---

## File Structure

### New Files
- `src/components/features/dashboard/dashboard-widget.tsx` — Reusable widget card
- `src/components/features/dashboard/week-strip.tsx` — 7-day horizontal strip
- `src/components/features/dashboard/dashboard-view.tsx` — Main client component

### Modified Files
- `src/app/(dashboard)/page.tsx` — Replace stub with server component

---

## Chunk 1: Widget + Week Strip + Dashboard View + Server Page

### Task 1: Dashboard Widget Component

**Files:**
- Create: `src/components/features/dashboard/dashboard-widget.tsx`

- [ ] **Step 1: Write the reusable widget card**

A simple card wrapper: title, contextual link, children, and empty state.

```typescript
'use client'

import Link from 'next/link'

interface DashboardWidgetProps {
  title: string
  linkHref: string
  linkText: string
  empty?: string // empty state message
  children?: React.ReactNode
}

export function DashboardWidget({ title, linkHref, linkText, empty, children }: DashboardWidgetProps) {
  return (
    <div className="border rounded-lg p-3">
      <div className="flex justify-between items-center mb-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Link href={linkHref} className="text-[11px] text-primary hover:underline">
          {linkText}
        </Link>
      </div>
      {children || (
        <p className="text-xs text-muted-foreground py-4 text-center">{empty || 'Nothing here'}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/dashboard/dashboard-widget.tsx
git commit -m "feat(dashboard): add reusable dashboard widget card"
```

### Task 2: Week Strip Component

**Files:**
- Create: `src/components/features/dashboard/week-strip.tsx`

- [ ] **Step 1: Write the week strip**

Horizontal 7-day strip showing day names, date numbers, today highlight, past-day dimming, and category-colored event dots.

```typescript
'use client'

import { getWeekStart, isSameDay, eventOverlapsDay } from '@/lib/utils/calendar'
import { CATEGORY_COLORS } from '@/types/calendar'
import type { CalendarEvent } from '@/types/calendar'

interface WeekStripProps {
  events: CalendarEvent[]
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_DOTS = 3

export function WeekStrip({ events }: WeekStripProps) {
  const today = new Date()
  const weekStart = getWeekStart(today)

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  return (
    <div className="border-b pb-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        This Week
      </p>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const isToday = isSameDay(day, today)
          const isPast = day < today && !isToday
          const dayEvents = events.filter((e) => eventOverlapsDay(e, day))
          // Deduplicate dots by category, max 3
          const categories = [...new Set(dayEvents.map((e) => e.category))].slice(0, MAX_DOTS)

          return (
            <div
              key={i}
              className={`text-center py-1.5 rounded-lg ${
                isToday ? 'bg-primary text-primary-foreground' : ''
              } ${isPast ? 'opacity-40' : ''}`}
            >
              <div className="text-[10px]">{DAY_NAMES[i]}</div>
              <div className={`text-base font-semibold ${isToday ? 'font-bold' : ''}`}>
                {day.getDate()}
              </div>
              <div className="flex gap-0.5 justify-center mt-1 h-[6px]">
                {categories.map((cat) => (
                  <div
                    key={cat}
                    className="w-[5px] h-[5px] rounded-full"
                    style={{ background: CATEGORY_COLORS[cat] }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/dashboard/week-strip.tsx
git commit -m "feat(dashboard): add week strip with event dots"
```

### Task 3: Dashboard View (Main Client Component)

**Files:**
- Create: `src/components/features/dashboard/dashboard-view.tsx`

- [ ] **Step 1: Write the main dashboard component**

This is the central component that renders the greeting, toggle, week strip, and all 4 widgets. It handles the "Just Me" client-side filter.

```typescript
'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { WeekStrip } from './week-strip'
import { DashboardWidget } from './dashboard-widget'
import { CATEGORY_COLORS } from '@/types/calendar'
import { PRIORITY_COLORS } from '@/types/todos'
import { formatTime } from '@/lib/utils/calendar'
import type { CalendarEvent } from '@/types/calendar'
import type { TodoItem } from '@/types/todos'
import type { InventoryItem } from '@/types/inventory'

interface MealEntry {
  id: string
  date: string
  meal_type: string
  custom_name: string | null
  person_ids: string[] | null
  recipes: { id: string; title: string } | null
}

interface DashboardViewProps {
  displayName: string
  events: CalendarEvent[]
  tasks: TodoItem[]
  meals: MealEntry[]
  expiringItems: InventoryItem[]
  currentPersonId: string | null // null if user has no person record (shouldn't happen)
}

type FilterMode = 'household' | 'me'

const MEAL_TYPE_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 }
const MAX_TASKS = 5
const MAX_INVENTORY = 5

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function getDueBadge(dueDate: string): { label: string; className: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate + 'T00:00:00')
  const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diff < 0) return { label: 'overdue', className: 'bg-red-500/20 text-red-400' }
  if (diff === 0) return { label: 'today', className: 'bg-amber-500/20 text-amber-400' }
  if (diff === 1) return { label: 'tomorrow', className: 'bg-blue-500/10 text-blue-400' }
  return {
    label: new Date(dueDate).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
    className: 'text-muted-foreground',
  }
}

function getExpiryBadge(expiryDate: string): { label: string; className: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const expiry = new Date(expiryDate + 'T00:00:00')
  const diff = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diff <= 0) return { label: 'today', className: 'bg-red-500/20 text-red-400' }
  if (diff === 1) return { label: 'tomorrow', className: 'bg-red-500/20 text-red-400' }
  return { label: `${diff} days`, className: 'bg-amber-500/20 text-amber-400' }
}

export function DashboardView({
  displayName,
  events,
  tasks,
  meals,
  expiringItems,
  currentPersonId,
}: DashboardViewProps) {
  const [filter, setFilter] = useState<FilterMode>('household')

  const isMe = filter === 'me'

  // Filter events
  const filteredEvents = useMemo(() => {
    if (!isMe || !currentPersonId) return events
    return events.filter(
      (e) => e.assigned_to.length === 0 || e.assigned_to.includes(currentPersonId)
    )
  }, [events, isMe, currentPersonId])

  // Today's events
  const todayEvents = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const todayIso = today.toISOString()
    const tomorrowIso = tomorrow.toISOString()

    return filteredEvents
      .filter((e) => e.start_datetime < tomorrowIso && e.end_datetime > todayIso)
      .sort((a, b) => {
        if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
        return new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
      })
  }, [filteredEvents])

  // Filter tasks
  const filteredTasks = useMemo(() => {
    let t = tasks
    if (isMe && currentPersonId) {
      t = t.filter((task) => !task.assigned_to || task.assigned_to === currentPersonId)
    }
    return t.sort((a, b) => {
      // overdue first, then by date, then by priority
      const aDate = a.due_date || '9999-12-31'
      const bDate = b.due_date || '9999-12-31'
      if (aDate !== bDate) return aDate.localeCompare(bDate)
      const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 }
      return (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4)
    })
  }, [tasks, isMe, currentPersonId])

  // Filter meals
  const filteredMeals = useMemo(() => {
    let m = meals
    if (isMe && currentPersonId) {
      m = m.filter(
        (meal) => !meal.person_ids || meal.person_ids.length === 0 || meal.person_ids.includes(currentPersonId)
      )
    }
    return m.sort((a, b) => (MEAL_TYPE_ORDER[a.meal_type] ?? 9) - (MEAL_TYPE_ORDER[b.meal_type] ?? 9))
  }, [meals, isMe, currentPersonId])

  const visibleTasks = filteredTasks.slice(0, MAX_TASKS)
  const taskOverflow = filteredTasks.length - MAX_TASKS
  const visibleInventory = expiringItems.slice(0, MAX_INVENTORY)
  const inventoryOverflow = expiringItems.length - MAX_INVENTORY

  const todayStr = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">{getGreeting()}, {displayName}</h1>
          <p className="text-xs text-muted-foreground">{todayStr}</p>
        </div>
        <div className="flex border rounded-md text-xs overflow-hidden">
          <button
            className={`px-3 py-1.5 ${filter === 'household' ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'}`}
            onClick={() => setFilter('household')}
          >
            Household
          </button>
          <button
            className={`px-3 py-1.5 ${filter === 'me' ? 'bg-primary text-primary-foreground font-medium' : 'hover:bg-muted'}`}
            onClick={() => setFilter('me')}
          >
            Just Me
          </button>
        </div>
      </div>

      {/* Week strip */}
      <WeekStrip events={filteredEvents} />

      {/* Widget grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Today's Events */}
        <DashboardWidget title="Today's Events" linkHref="/calendar" linkText="View calendar" empty="No events today">
          {todayEvents.length > 0 && (
            <div className="space-y-0.5">
              {todayEvents.map((evt) => (
                <div key={evt.id} className="flex items-center gap-2 py-1.5">
                  <div
                    className="w-[3px] h-6 rounded-sm shrink-0"
                    style={{ background: CATEGORY_COLORS[evt.category] }}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{evt.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {evt.all_day ? 'All day' : `${formatTime(new Date(evt.start_datetime))} – ${formatTime(new Date(evt.end_datetime))}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DashboardWidget>

        {/* Tasks Due */}
        <DashboardWidget title="Tasks Due" linkHref="/todos" linkText="View todos" empty="No tasks due">
          {visibleTasks.length > 0 && (
            <div className="space-y-0.5">
              {visibleTasks.map((task) => {
                const badge = task.due_date ? getDueBadge(task.due_date) : null
                const prioColor = PRIORITY_COLORS[task.priority]
                return (
                  <div key={task.id} className="flex items-center gap-1.5 py-1">
                    <div
                      className="w-3 h-3 rounded-sm border-2 shrink-0"
                      style={{ borderColor: prioColor || 'var(--border)' }}
                    />
                    <span className="text-xs flex-1 truncate">{task.title}</span>
                    {badge && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-md shrink-0 ${badge.className}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                )
              })}
              {taskOverflow > 0 && (
                <Link href="/todos" className="text-[10px] text-muted-foreground hover:text-foreground block pt-1">
                  +{taskOverflow} more
                </Link>
              )}
            </div>
          )}
        </DashboardWidget>

        {/* Today's Meals */}
        <DashboardWidget
          title="Today's Meals"
          linkHref="/meal-plans"
          linkText="View meal plan"
          empty={undefined}
        >
          {filteredMeals.length > 0 ? (
            <div className="space-y-0.5">
              {filteredMeals.map((meal) => (
                <div key={meal.id} className="py-1.5">
                  <div className="text-[10px] uppercase text-muted-foreground font-semibold">
                    {meal.meal_type}
                  </div>
                  <div className="text-xs font-medium mt-0.5">
                    {meal.recipes?.title || meal.custom_name || 'Untitled'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4 text-center">
              No meals planned — <Link href="/meal-plans" className="text-primary hover:underline">Plan meals</Link>
            </p>
          )}
        </DashboardWidget>

        {/* Expiring Inventory */}
        <DashboardWidget title="Expiring Soon" linkHref="/inventory" linkText="View inventory" empty="Nothing expiring soon">
          {visibleInventory.length > 0 && (
            <div className="space-y-0.5">
              {visibleInventory.map((item) => {
                const badge = item.expiry_date ? getExpiryBadge(item.expiry_date) : null
                return (
                  <div key={item.id} className="flex items-center justify-between py-1">
                    <span className="text-xs truncate">{item.display_name}</span>
                    {badge && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-md shrink-0 ${badge.className}`}>
                        {badge.label}
                      </span>
                    )}
                  </div>
                )
              })}
              {inventoryOverflow > 0 && (
                <Link href="/inventory" className="text-[10px] text-muted-foreground hover:text-foreground block pt-1">
                  +{inventoryOverflow} more
                </Link>
              )}
            </div>
          )}
        </DashboardWidget>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/features/dashboard/dashboard-view.tsx
git commit -m "feat(dashboard): add main dashboard view with greeting, toggle, and widgets"
```

### Task 4: Home Page Server Component

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

- [ ] **Step 1: Replace the stub with the server component**

This fetches all 4 data sources plus household persons, then renders DashboardView.

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DashboardView } from '@/components/features/dashboard/dashboard-view'
import { getWeekStart, getWeekRange } from '@/lib/utils/calendar'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('default_household_id, display_name')
    .eq('id', user.id)
    .single()

  const householdId = profile?.default_household_id
  if (!householdId) redirect('/onboarding')

  const displayName = profile?.display_name || user.email?.split('@')[0] || 'there'

  // Date computations
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  const weekStart = getWeekStart(now)
  const { start: weekStartIso, end: weekEndIso } = getWeekRange(weekStart)
  const threeDaysFromNow = new Date(now)
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
  const threeDaysStr = threeDaysFromNow.toISOString().split('T')[0]

  // Fetch all data in parallel
  const [eventsResult, listsResult, mealsResult, inventoryResult, personsResult] = await Promise.all([
    // Events this week
    (supabase as any)
      .from('calendar_events')
      .select('*')
      .eq('household_id', householdId)
      .lt('start_datetime', weekEndIso)
      .gt('end_datetime', weekStartIso)
      .order('start_datetime', { ascending: true }),

    // Todo lists with items (for tasks due)
    (supabase as any)
      .from('todo_lists')
      .select('*, todo_items(*)')
      .eq('household_id', householdId)
      .neq('list_type', 'shopping')
      .eq('archived', false),

    // Meals today
    supabase
      .from('meal_plan_entries')
      .select('*, recipes(id, title)')
      .eq('household_id', householdId)
      .eq('date', today),

    // Expiring inventory
    (supabase as any)
      .from('inventory_items')
      .select('*')
      .eq('household_id', householdId)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', threeDaysStr)
      .gte('expiry_date', today)
      .order('expiry_date', { ascending: true }),

    // Household persons
    supabase
      .from('household_persons')
      .select('id, display_name, person_type')
      .eq('household_id', householdId),
  ])

  const events = eventsResult.data || []
  const meals = mealsResult.data || []
  const expiringItems = inventoryResult.data || []
  const persons = personsResult.data || []

  // Flatten tasks from lists
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const thirtyDaysStr = thirtyDaysAgo.toISOString().split('T')[0]
  const weekEndDate = weekEndIso.split('T')[0]

  const tasks = (listsResult.data || [])
    .flatMap((list: any) => list.todo_items || [])
    .filter((item: any) =>
      item.status !== 'completed' &&
      item.due_date &&
      item.due_date >= thirtyDaysStr &&
      item.due_date <= weekEndDate
    )

  // Find current user's person ID
  // household_members links profile_id (= user.id) to a person ID
  const { data: memberRow } = await supabase
    .from('household_members')
    .select('id')
    .eq('household_id', householdId)
    .eq('profile_id', user.id)
    .single()

  const currentPersonId = memberRow?.id || null

  return (
    <DashboardView
      displayName={displayName}
      events={events}
      tasks={tasks}
      meals={meals}
      expiringItems={expiringItems}
      currentPersonId={currentPersonId}
    />
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\\(dashboard\\)/page.tsx
git commit -m "feat(dashboard): replace stub with server component home dashboard"
```

### Task 5: Smoke Test

- [ ] **Step 1: Verify the app builds**

Run: `npx next build 2>&1 | tail -30`

Fix any type errors. Likely issues:
- `calendar_events` / `inventory_items` not in generated types — already using `(supabase as any)`
- Import path issues

- [ ] **Step 2: Fix any build errors**

- [ ] **Step 3: Commit fixes if any**

```bash
git add -A
git commit -m "fix(dashboard): build fixes"
```
