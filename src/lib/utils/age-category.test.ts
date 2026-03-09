import { describe, it, expect, vi, afterEach } from 'vitest'
import { getAgeCategory, type AgeCategory } from './age-category'

describe('getAgeCategory', () => {
  afterEach(() => { vi.useRealTimers() })

  it('returns baby for < 1 year old', () => {
    vi.setSystemTime(new Date('2026-03-09'))
    expect(getAgeCategory('2025-06-01')).toBe('baby')
  })

  it('returns toddler for 1-3 year old', () => {
    vi.setSystemTime(new Date('2026-03-09'))
    expect(getAgeCategory('2024-01-01')).toBe('toddler')
  })

  it('returns child for 3-11 year old', () => {
    vi.setSystemTime(new Date('2026-03-09'))
    expect(getAgeCategory('2020-01-01')).toBe('child')
  })

  it('returns teenager for 11+', () => {
    vi.setSystemTime(new Date('2026-03-09'))
    expect(getAgeCategory('2014-01-01')).toBe('teenager')
  })

  it('returns null for null input', () => {
    expect(getAgeCategory(null)).toBeNull()
  })
})
