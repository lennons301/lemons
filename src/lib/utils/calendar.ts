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

/**
 * Format a Date as YYYY-MM-DD using its local calendar date.
 *
 * Use this when the Date represents a moment in the local timezone (e.g.
 * `new Date()` with `setHours(0,0,0,0)`). Prefer this over
 * `date.toISOString().split('T')[0]`, which converts to UTC and yields the
 * wrong day for any local-midnight Date east of UTC (e.g. BST).
 */
export function toLocalDateIso(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Format a Date as YYYY-MM-DD using its UTC calendar date.
 *
 * Use this when the Date is conceptually UTC-anchored (e.g. parsed from a
 * `YYYY-MM-DD` string with `new Date('2026-04-28')`, which produces UTC
 * midnight). Pairs with `setUTCDate` for date arithmetic.
 */
export function toUtcDateIso(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Shift a YYYY-MM-DD string by a whole number of days, returning YYYY-MM-DD. */
export function addDaysToIsoDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return toUtcDateIso(d)
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

export interface OverlapPosition<T> {
  event: T
  /** Fraction of column width (0..1) the event occupies. */
  widthFraction: number
  /** Zero-based column slot the event sits in (0..numColumns-1). */
  offsetIndex: number
}

/**
 * Compute side-by-side layout positions for timed events that may overlap.
 *
 * Algorithm:
 *   1. Sort events by start time.
 *   2. Partition into transitive-overlap clusters: events whose intervals are
 *      connected by any chain of pairwise overlaps.
 *   3. Within each cluster, run first-fit column packing — assign each event
 *      to the leftmost column whose previous occupant has already ended. The
 *      cluster's column count is the maximum simultaneous overlap inside it.
 *   4. Width is 1/numColumns *for that cluster only*, so a brief 3-way overlap
 *      doesn't penalise non-overlapping events elsewhere in the day.
 *
 * The naive alternative — width = 1/clusterSize — over-narrows non-overlapping
 * events that happen to share a transitive cluster (e.g. A overlaps B, B
 * overlaps C, but A and C don't overlap: only 2 columns are needed, not 3).
 */
export function computeOverlapPositions<
  T extends { start_datetime: string; end_datetime: string }
>(events: T[]): OverlapPosition<T>[] {
  if (events.length === 0) return []

  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
  )

  // Step 1: partition into transitive-overlap clusters.
  const clusters: T[][] = []
  for (const evt of sorted) {
    const evtStart = new Date(evt.start_datetime).getTime()
    const evtEnd = new Date(evt.end_datetime).getTime()

    let placed = false
    for (const cluster of clusters) {
      const overlaps = cluster.some((g) => {
        const gStart = new Date(g.start_datetime).getTime()
        const gEnd = new Date(g.end_datetime).getTime()
        return evtStart < gEnd && evtEnd > gStart
      })
      if (overlaps) {
        cluster.push(evt)
        placed = true
        break
      }
    }
    if (!placed) clusters.push([evt])
  }

  // Step 2: first-fit column packing within each cluster.
  const positioned: OverlapPosition<T>[] = []
  for (const cluster of clusters) {
    const columnEnds: number[] = []
    const colByIndex: number[] = []

    for (const evt of cluster) {
      const evtStart = new Date(evt.start_datetime).getTime()
      const evtEnd = new Date(evt.end_datetime).getTime()

      let col = columnEnds.findIndex((end) => end <= evtStart)
      if (col === -1) {
        col = columnEnds.length
        columnEnds.push(evtEnd)
      } else {
        columnEnds[col] = evtEnd
      }
      colByIndex.push(col)
    }

    const width = 1 / columnEnds.length
    for (let i = 0; i < cluster.length; i++) {
      positioned.push({
        event: cluster[i],
        widthFraction: width,
        offsetIndex: colByIndex[i],
      })
    }
  }

  return positioned
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
export function getEventsForDay(events: { start_datetime: string; end_datetime: string; all_day?: boolean }[], day: Date) {
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
