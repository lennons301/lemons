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
