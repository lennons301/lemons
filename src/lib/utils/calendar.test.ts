import { describe, it, expect } from 'vitest'
import { toLocalDateIso, toUtcDateIso, addDaysToIsoDate } from './calendar'

describe('toLocalDateIso', () => {
  it('formats local-component date as YYYY-MM-DD', () => {
    const d = new Date(2026, 3, 28) // April 28 in local TZ (month is 0-indexed)
    expect(toLocalDateIso(d)).toBe('2026-04-28')
  })

  it('zero-pads single-digit month and day', () => {
    const d = new Date(2026, 0, 5)
    expect(toLocalDateIso(d)).toBe('2026-01-05')
  })
})

describe('toUtcDateIso', () => {
  it('formats UTC-anchored Date as YYYY-MM-DD', () => {
    const d = new Date('2026-04-28T00:00:00Z')
    expect(toUtcDateIso(d)).toBe('2026-04-28')
  })

  it('returns the UTC date even when local date differs', () => {
    // 23:30 UTC on 2026-04-27 — local TZ may render this as 2026-04-28 east of UTC
    const d = new Date('2026-04-27T23:30:00Z')
    expect(toUtcDateIso(d)).toBe('2026-04-27')
  })
})

describe('addDaysToIsoDate', () => {
  it('adds days', () => {
    expect(addDaysToIsoDate('2026-04-28', 3)).toBe('2026-05-01')
  })

  it('subtracts days', () => {
    expect(addDaysToIsoDate('2026-04-28', -30)).toBe('2026-03-29')
  })

  it('handles month boundaries', () => {
    expect(addDaysToIsoDate('2026-01-31', 1)).toBe('2026-02-01')
  })

  it('handles year boundaries', () => {
    expect(addDaysToIsoDate('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('returns the same day when delta is zero', () => {
    expect(addDaysToIsoDate('2026-04-28', 0)).toBe('2026-04-28')
  })
})
