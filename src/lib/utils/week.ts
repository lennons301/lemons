/**
 * Get the start of the week containing `date`, where week starts on `weekStartDay`.
 * weekStartDay uses JS getDay() convention: 0=Sunday, 1=Monday, ..., 6=Saturday.
 * Default is 1 (Monday) for backward compatibility.
 */
export function getWeekStart(date: Date, weekStartDay: number = 1): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Sun
  let diff = weekStartDay - day
  if (diff > 0) diff -= 7
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function getWeekDays(weekStart: Date): string[] {
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    days.push(`${year}-${month}-${day}`)
  }
  return days
}

export function formatWeekLabel(weekStart: Date): string {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)

  const startMonth = weekStart.toLocaleDateString('en-GB', { month: 'short' })
  const endMonth = end.toLocaleDateString('en-GB', { month: 'short' })

  if (startMonth === endMonth) {
    return `${startMonth} ${weekStart.getDate()}–${end.getDate()}, ${weekStart.getFullYear()}`
  }
  return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`
}

export function shiftWeek(weekStart: Date, weeks: number): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + weeks * 7)
  return d
}

/** Ordered day name abbreviations starting from weekStartDay. */
const ALL_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function getOrderedDayNames(weekStartDay: number): string[] {
  return Array.from({ length: 7 }, (_, i) => ALL_DAY_NAMES[(weekStartDay + i) % 7])
}

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealType = (typeof MEAL_TYPES)[number]
