import { describe, it, expect } from 'vitest'
import { getWeekStart, getWeekDays, formatWeekLabel } from './week'

describe('getWeekStart', () => {
  it('returns Monday for a Wednesday', () => {
    const wed = new Date('2026-03-11') // Wednesday
    const monday = getWeekStart(wed)
    expect(monday.toISOString().split('T')[0]).toBe('2026-03-09')
  })

  it('returns same day if already Monday', () => {
    const mon = new Date('2026-03-09')
    expect(getWeekStart(mon).toISOString().split('T')[0]).toBe('2026-03-09')
  })

  it('handles Sunday (returns previous Monday)', () => {
    const sun = new Date('2026-03-15')
    expect(getWeekStart(sun).toISOString().split('T')[0]).toBe('2026-03-09')
  })
})

describe('getWeekDays', () => {
  it('returns 7 days starting from the given Monday', () => {
    const monday = new Date('2026-03-09')
    const days = getWeekDays(monday)
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-03-09')
    expect(days[6]).toBe('2026-03-15')
  })
})

describe('formatWeekLabel', () => {
  it('formats week range', () => {
    const label = formatWeekLabel(new Date('2026-03-09'))
    expect(label).toContain('Mar')
    expect(label).toContain('9')
    expect(label).toContain('15')
  })
})
