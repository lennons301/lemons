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
  assigned_to: string[]
  recipes: { id: string; title: string } | null
}

interface DashboardViewProps {
  displayName: string
  events: CalendarEvent[]
  tasks: TodoItem[]
  meals: MealEntry[]
  expiringItems: InventoryItem[]
  currentPersonId: string | null
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
        (meal) => meal.assigned_to.length === 0 || meal.assigned_to.includes(currentPersonId)
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
