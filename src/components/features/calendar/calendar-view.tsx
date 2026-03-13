'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
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
import type { Person } from '@/types/person'

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
      } else {
        toast.error('Failed to save event')
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
      } else {
        toast.error('Failed to create event')
      }
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/calendar/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setEvents((prev) => prev.filter((e) => e.id !== id))
    } else {
      toast.error('Failed to delete event')
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
