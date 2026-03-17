/**
 * Calendar date utilities. No external library.
 * All functions assume Monday = start of week.
 */

/** Get the Monday of the week containing the given date. */
export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  // JS: Sunday=0, Monday=1. We want Monday=0.
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

/** Get the Sunday (end of week) for the week containing the given date. */
export function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  return end
}

/** Get the first day to show in a month grid (Monday of the week containing the 1st). */
export function getMonthGridStart(year: number, month: number): Date {
  const firstOfMonth = new Date(year, month, 1)
  return getWeekStart(firstOfMonth)
}

/** Get the last day to show in a month grid (Sunday of the week containing the last day). */
export function getMonthGridEnd(year: number, month: number): Date {
  const lastOfMonth = new Date(year, month + 1, 0) // Last day of month
  const end = getWeekEnd(lastOfMonth)
  return end
}

/** Generate all dates for a month grid (42 days = 6 weeks, or 35 = 5 weeks). */
export function getMonthGridDays(year: number, month: number): Date[] {
  const start = getMonthGridStart(year, month)
  const end = getMonthGridEnd(year, month)
  const days: Date[] = []
  const current = new Date(start)
  while (current <= end) {
    days.push(new Date(current))
    current.setDate(current.getDate() + 1)
  }
  return days
}

/** Check if two dates are the same calendar day. */
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

/** Check if a date is today. */
export function isToday(date: Date): boolean {
  return isSameDay(date, new Date())
}

/** Format a date as "March 2026" for month header. */
export function formatMonthYear(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

/** Format a week range as "Mar 9 – 15" or "Mar 28 – Apr 3" for week header. */
export function formatWeekRange(start: Date, end: Date): string {
  const startMonth = start.toLocaleDateString('en-GB', { month: 'short' })
  const endMonth = end.toLocaleDateString('en-GB', { month: 'short' })
  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()} – ${end.getDate()}`
  }
  return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}`
}

/** Format time as "9am", "2:30pm", etc. */
export function formatTime(date: Date): string {
  const h = date.getHours()
  const m = date.getMinutes()
  const suffix = h >= 12 ? 'pm' : 'am'
  const hour = h % 12 || 12
  return m === 0 ? `${hour}${suffix}` : `${hour}:${m.toString().padStart(2, '0')}${suffix}`
}

/**
 * Check if an event overlaps a specific day.
 * Uses exclusive-end convention: event spans [start, end).
 *
 * All-day events are stored as UTC midnight (e.g. 2026-03-17T00:00:00Z).
 * Comparing them against local-time day boundaries causes off-by-one errors
 * for users east of UTC. For all-day events we compare date strings directly
 * to avoid any timezone arithmetic.
 */
export function eventOverlapsDay(event: { start_datetime: string; end_datetime: string; all_day?: boolean }, day: Date): boolean {
  if (event.all_day) {
    // Compare YYYY-MM-DD strings — timezone independent
    const startDate = event.start_datetime.slice(0, 10)
    const endDate = event.end_datetime.slice(0, 10)
    const y = day.getFullYear()
    const m = String(day.getMonth() + 1).padStart(2, '0')
    const d = String(day.getDate()).padStart(2, '0')
    const dayDate = `${y}-${m}-${d}`
    return startDate <= dayDate && dayDate < endDate
  }

  // Timed events: compare using local-time day boundaries
  const dayStart = new Date(day)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const eventStart = new Date(event.start_datetime)
  const eventEnd = new Date(event.end_datetime)

  return eventStart < dayEnd && eventEnd > dayStart
}

/**
 * Get events for a specific day from a list.
 */
export function getEventsForDay(events: { start_datetime: string; end_datetime: string }[], day: Date) {
  return events.filter((e) => eventOverlapsDay(e, day))
}

/**
 * Check if an event spans multiple days.
 */
export function isMultiDay(event: { start_datetime: string; end_datetime: string; all_day: boolean }): boolean {
  const start = new Date(event.start_datetime)
  const end = new Date(event.end_datetime)
  // For all-day events: multi-day if end is more than 1 day after start
  if (event.all_day) {
    const diffMs = end.getTime() - start.getTime()
    return diffMs > 24 * 60 * 60 * 1000
  }
  // For timed events: multi-day if they span different calendar days
  return start.toDateString() !== end.toDateString()
}

/** Get the date range for API queries covering the full visible month grid. Returns ISO strings. */
export function getMonthRange(year: number, month: number): { start: string; end: string } {
  const gridStart = getMonthGridStart(year, month)
  const gridEnd = getMonthGridEnd(year, month)
  // Exclusive end: day after grid end
  const end = new Date(gridEnd)
  end.setDate(end.getDate() + 1)
  return {
    start: gridStart.toISOString(),
    end: end.toISOString(),
  }
}

export function getWeekRange(weekStart: Date): { start: string; end: string } {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 7)
  return {
    start: weekStart.toISOString(),
    end: end.toISOString(),
  }
}
