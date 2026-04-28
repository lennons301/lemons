import { describe, it, expect } from 'vitest'
import {
  toLocalDateIso,
  toUtcDateIso,
  addDaysToIsoDate,
  computeOverlapPositions,
} from './calendar'

function evt(id: string, start: string, end: string) {
  return { id, start_datetime: `2026-04-28T${start}:00`, end_datetime: `2026-04-28T${end}:00` }
}

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

describe('computeOverlapPositions', () => {
  it('returns [] for empty input', () => {
    expect(computeOverlapPositions([])).toEqual([])
  })

  it('puts a single event at full width, column 0', () => {
    const a = evt('a', '09:00', '10:00')
    expect(computeOverlapPositions([a])).toEqual([
      { event: a, widthFraction: 1, offsetIndex: 0 },
    ])
  })

  it('puts non-overlapping events all at full width', () => {
    const a = evt('a', '09:00', '10:00')
    const b = evt('b', '11:00', '12:00')
    const result = computeOverlapPositions([a, b])
    expect(result).toHaveLength(2)
    for (const p of result) {
      expect(p.widthFraction).toBe(1)
      expect(p.offsetIndex).toBe(0)
    }
  })

  it('treats touching events (A ends when B starts) as non-overlapping', () => {
    const a = evt('a', '09:00', '10:00')
    const b = evt('b', '10:00', '11:00')
    const result = computeOverlapPositions([a, b])
    for (const p of result) expect(p.widthFraction).toBe(1)
  })

  it('splits two overlapping events evenly', () => {
    const a = evt('a', '09:00', '11:00')
    const b = evt('b', '10:00', '12:00')
    const result = computeOverlapPositions([a, b])
    const positions = Object.fromEntries(result.map((p) => [p.event.id, p]))
    expect(positions.a.widthFraction).toBe(0.5)
    expect(positions.b.widthFraction).toBe(0.5)
    expect(new Set([positions.a.offsetIndex, positions.b.offsetIndex])).toEqual(new Set([0, 1]))
  })

  it('splits three mutually overlapping events into thirds', () => {
    const a = evt('a', '09:00', '12:00')
    const b = evt('b', '10:00', '11:30')
    const c = evt('c', '10:30', '11:00')
    const result = computeOverlapPositions([a, b, c])
    for (const p of result) expect(p.widthFraction).toBeCloseTo(1 / 3)
    expect(new Set(result.map((p) => p.offsetIndex))).toEqual(new Set([0, 1, 2]))
  })

  it('packs non-overlapping events within a transitive cluster into shared columns', () => {
    // A 9-10:30 overlaps B 10-11; B overlaps C 10:45-12. A and C do NOT overlap
    // each other, so they can share column 0; the cluster needs only 2 columns.
    const a = evt('a', '09:00', '10:30')
    const b = evt('b', '10:00', '11:00')
    const c = evt('c', '10:45', '12:00')
    const result = computeOverlapPositions([a, b, c])
    const positions = Object.fromEntries(result.map((p) => [p.event.id, p]))
    expect(positions.a.widthFraction).toBe(0.5)
    expect(positions.b.widthFraction).toBe(0.5)
    expect(positions.c.widthFraction).toBe(0.5)
    expect(positions.a.offsetIndex).toBe(positions.c.offsetIndex)
    expect(positions.b.offsetIndex).not.toBe(positions.a.offsetIndex)
  })

  it('keeps separate clusters independent: a brief overlap does not narrow unrelated events later', () => {
    // A & B overlap briefly; C is way later, fully alone. C should stay full width.
    const a = evt('a', '09:00', '09:30')
    const b = evt('b', '09:15', '09:45')
    const c = evt('c', '14:00', '15:00')
    const result = computeOverlapPositions([a, b, c])
    const positions = Object.fromEntries(result.map((p) => [p.event.id, p]))
    expect(positions.a.widthFraction).toBe(0.5)
    expect(positions.b.widthFraction).toBe(0.5)
    expect(positions.c.widthFraction).toBe(1)
    expect(positions.c.offsetIndex).toBe(0)
  })

  it('is order-independent (sorts internally)', () => {
    const a = evt('a', '09:00', '11:00')
    const b = evt('b', '10:00', '12:00')
    const forward = computeOverlapPositions([a, b])
    const reverse = computeOverlapPositions([b, a])
    // Both runs should produce the same widths and same column assignments per event.
    const forwardById = Object.fromEntries(forward.map((p) => [p.event.id, p]))
    const reverseById = Object.fromEntries(reverse.map((p) => [p.event.id, p]))
    expect(reverseById.a).toEqual(forwardById.a)
    expect(reverseById.b).toEqual(forwardById.b)
  })
})
