import { describe, it, expect } from 'vitest'
import { getWeekStart, getWeekDays, formatWeekLabel, getOrderedDayNames } from './week'

describe('getWeekStart (Monday default)', () => {
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

describe('getWeekStart (Friday start)', () => {
  // weekStartDay = 5 (Friday)
  it('returns same day if already Friday', () => {
    const fri = new Date('2026-03-13') // Friday
    expect(getWeekStart(fri, 5).toISOString().split('T')[0]).toBe('2026-03-13')
  })

  it('returns previous Friday for a Wednesday', () => {
    const wed = new Date('2026-03-11') // Wednesday
    expect(getWeekStart(wed, 5).toISOString().split('T')[0]).toBe('2026-03-06')
  })

  it('returns previous Friday for a Saturday', () => {
    const sat = new Date('2026-03-14') // Saturday
    expect(getWeekStart(sat, 5).toISOString().split('T')[0]).toBe('2026-03-13')
  })

  it('returns previous Friday for a Thursday', () => {
    const thu = new Date('2026-03-12') // Thursday
    expect(getWeekStart(thu, 5).toISOString().split('T')[0]).toBe('2026-03-06')
  })
})

describe('getWeekStart (Sunday start)', () => {
  it('returns same day if already Sunday', () => {
    const sun = new Date('2026-03-15') // Sunday
    expect(getWeekStart(sun, 0).toISOString().split('T')[0]).toBe('2026-03-15')
  })

  it('returns previous Sunday for a Wednesday', () => {
    const wed = new Date('2026-03-11') // Wednesday
    expect(getWeekStart(wed, 0).toISOString().split('T')[0]).toBe('2026-03-08')
  })
})

describe('getWeekDays', () => {
  it('returns 7 days starting from the given date', () => {
    const monday = new Date('2026-03-09')
    const days = getWeekDays(monday)
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-03-09')
    expect(days[6]).toBe('2026-03-15')
  })

  it('returns 7 days for a Friday start', () => {
    const friday = new Date('2026-03-13')
    const days = getWeekDays(friday)
    expect(days).toHaveLength(7)
    expect(days[0]).toBe('2026-03-13')
    expect(days[6]).toBe('2026-03-19')
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

describe('getOrderedDayNames', () => {
  it('returns Mon-first for weekStartDay=1', () => {
    expect(getOrderedDayNames(1)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  })

  it('returns Fri-first for weekStartDay=5', () => {
    expect(getOrderedDayNames(5)).toEqual(['Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'])
  })

  it('returns Sun-first for weekStartDay=0', () => {
    expect(getOrderedDayNames(0)).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'])
  })
})
