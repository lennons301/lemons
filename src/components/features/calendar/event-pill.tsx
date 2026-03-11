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
  const timePrefix = !event.all_day ? `${formatTime(event.start_time)} ` : ''

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
    </button>
  )
}
