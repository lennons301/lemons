'use client'

import { CATEGORY_COLORS } from '@/types/calendar'
import { formatTime } from '@/lib/utils/calendar'
import type { CalendarEvent } from '@/types/calendar'

interface EventWithProgress extends CalendarEvent {
  list_progress?: { list_id: string; total: number; completed: number } | null
}

interface EventPillProps {
  event: EventWithProgress
  onClick: (event: EventWithProgress) => void
  isMultiDaySegment?: boolean // true if this is part of a multi-day bar
}

export function EventPill({ event, onClick, isMultiDaySegment }: EventPillProps) {
  const color = CATEGORY_COLORS[event.category]
  const timePrefix = !event.all_day ? `${formatTime(new Date(event.start_datetime))} ` : ''

  return (
    <button
      className="block w-full text-left text-xs font-medium px-1.5 py-0.5 truncate"
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
      {event.list_progress && event.list_progress.total > 0 && (
        <span className="ml-1 opacity-80">
          {event.list_progress.completed}/{event.list_progress.total}
        </span>
      )}
    </button>
  )
}
