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
