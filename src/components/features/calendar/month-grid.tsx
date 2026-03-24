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

function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const MAX_VISIBLE_EVENTS = 3

export function MonthGrid({ year, month, events, onDayClick, onEventClick }: MonthGridProps) {
  const days = useMemo(() => getMonthGridDays(year, month), [year, month])

  const dayEvents = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const day of days) {
      const key = localDateKey(day)
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
          const key = localDateKey(day)
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
