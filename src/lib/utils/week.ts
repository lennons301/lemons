export function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  // getDay: 0=Sun, 1=Mon. We want Monday as start.
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function getWeekDays(weekStart: Date): string[] {
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    days.push(d.toISOString().split('T')[0])
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

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealType = (typeof MEAL_TYPES)[number]
