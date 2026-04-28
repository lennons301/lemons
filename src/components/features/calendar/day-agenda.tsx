'use client'

import { useMemo, useState } from 'react'
import { MapPin, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CATEGORY_COLORS } from '@/types/calendar'
import { eventOverlapsDay, formatTime, isSameDay } from '@/lib/utils/calendar'
import type { CalendarEventWithProgress } from '@/types/calendar'

interface DayAgendaProps {
  weekStart: Date
  events: CalendarEventWithProgress[]
  onSlotClick: (date: Date) => void
  onEventClick: (event: CalendarEventWithProgress) => void
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function DayAgenda({ weekStart, events, onSlotClick, onEventClick }: DayAgendaProps) {
  const [selectedIdx, setSelectedIdx] = useState<number>(() => {
    const today = new Date()
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      if (isSameDay(d, today)) return i
    }
    return 0
  })

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(d.getDate() + i)
        return d
      }),
    [weekStart]
  )

  const selectedDay = days[selectedIdx]

  const { allDay, timed } = useMemo(() => {
    const allDayEvts: CalendarEventWithProgress[] = []
    const timedEvts: CalendarEventWithProgress[] = []
    for (const evt of events) {
      if (!eventOverlapsDay(evt, selectedDay)) continue
      if (evt.all_day) allDayEvts.push(evt)
      else timedEvts.push(evt)
    }
    timedEvts.sort(
      (a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
    )
    return { allDay: allDayEvts, timed: timedEvts }
  }, [events, selectedDay])

  const counts = useMemo(
    () => days.map((day) => events.filter((e) => eventOverlapsDay(e, day)).length),
    [days, events]
  )

  const today = new Date()
  const isEmpty = allDay.length === 0 && timed.length === 0

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const isToday = isSameDay(day, today)
          const isSelected = i === selectedIdx
          return (
            <button
              key={day.toISOString()}
              onClick={() => setSelectedIdx(i)}
              className={`text-center py-1.5 rounded-lg w-full transition-colors ${
                isSelected
                  ? 'bg-primary text-primary-foreground'
                  : isToday
                    ? 'ring-1 ring-primary text-primary hover:bg-primary/10'
                    : 'hover:bg-muted'
              }`}
            >
              <div className="text-[10px]">{DAY_NAMES[i]}</div>
              <div className="text-base font-semibold">{day.getDate()}</div>
              <div className="h-[6px] flex justify-center mt-0.5">
                {counts[i] > 0 && (
                  <div
                    className={`w-1 h-1 rounded-full ${
                      isSelected ? 'bg-primary-foreground/80' : 'bg-primary'
                    }`}
                  />
                )}
              </div>
            </button>
          )
        })}
      </div>

      {allDay.length > 0 && (
        <section className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            All day
          </p>
          {allDay.map((evt) => (
            <AgendaCard key={evt.id} event={evt} onClick={onEventClick} />
          ))}
        </section>
      )}

      {isEmpty ? (
        <button
          type="button"
          onClick={() => onSlotClick(selectedDay)}
          className="w-full rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
        >
          <Plus className="inline h-4 w-4 mr-1 -mt-0.5" />
          No events — tap to add
        </button>
      ) : (
        <>
          {timed.length > 0 && (
            <section className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Schedule
              </p>
              {timed.map((evt) => (
                <AgendaCard key={evt.id} event={evt} onClick={onEventClick} />
              ))}
            </section>
          )}
          <Button variant="outline" className="w-full" onClick={() => onSlotClick(selectedDay)}>
            <Plus className="h-4 w-4 mr-1" />
            Add event
          </Button>
        </>
      )}
    </div>
  )
}

function AgendaCard({
  event,
  onClick,
}: {
  event: CalendarEventWithProgress
  onClick: (e: CalendarEventWithProgress) => void
}) {
  const color = CATEGORY_COLORS[event.category]
  const start = new Date(event.start_datetime)
  const end = new Date(event.end_datetime)
  const timeLabel = event.all_day ? 'All day' : `${formatTime(start)} – ${formatTime(end)}`

  return (
    <button
      type="button"
      onClick={() => onClick(event)}
      className="w-full text-left flex gap-3 rounded-md border bg-card p-3 hover:border-primary/50 transition-colors"
    >
      <div className="w-1 shrink-0 rounded-full self-stretch" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold line-clamp-2">{event.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{timeLabel}</p>
        {event.location && (
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{event.location}</span>
          </p>
        )}
        {event.list_progress && event.list_progress.total > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            ☑ {event.list_progress.completed}/{event.list_progress.total}
          </p>
        )}
      </div>
    </button>
  )
}
