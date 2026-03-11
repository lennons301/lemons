'use client'

import { useMemo, useRef, useEffect } from 'react'
import { isSameDay, eventOverlapsDay } from '@/lib/utils/calendar'
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
