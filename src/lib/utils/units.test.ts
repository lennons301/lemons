import { describe, it, expect } from 'vitest'
import { normalizeUnit, convertUnit, UNIT_ALIASES } from './units'

describe('normalizeUnit', () => {
  it('normalizes common aliases', () => {
    expect(normalizeUnit('tbsp')).toBe('tablespoon')
    expect(normalizeUnit('tsp')).toBe('teaspoon')
    expect(normalizeUnit('cups')).toBe('cup')
    expect(normalizeUnit('g')).toBe('gram')
    expect(normalizeUnit('kg')).toBe('kilogram')
    expect(normalizeUnit('ml')).toBe('millilitre')
    expect(normalizeUnit('l')).toBe('litre')
    expect(normalizeUnit('oz')).toBe('ounce')
    expect(normalizeUnit('lb')).toBe('pound')
    expect(normalizeUnit('lbs')).toBe('pound')
  })

  it('lowercases and trims', () => {
    expect(normalizeUnit('  TBSP  ')).toBe('tablespoon')
    expect(normalizeUnit('Cup')).toBe('cup')
  })

  it('returns original (lowered/trimmed) for unknown units', () => {
    expect(normalizeUnit('bunch')).toBe('bunch')
    expect(normalizeUnit('pinch')).toBe('pinch')
  })

  it('returns empty string for null/undefined/empty', () => {
    expect(normalizeUnit('')).toBe('')
    expect(normalizeUnit(null as unknown as string)).toBe('')
    expect(normalizeUnit(undefined as unknown as string)).toBe('')
  })
})

describe('convertUnit', () => {
  it('converts metric volume', () => {
    expect(convertUnit(1000, 'millilitre', 'litre')).toBeCloseTo(1)
    expect(convertUnit(1, 'litre', 'millilitre')).toBeCloseTo(1000)
  })

  it('converts metric weight', () => {
    expect(convertUnit(1000, 'gram', 'kilogram')).toBeCloseTo(1)
    expect(convertUnit(1, 'kilogram', 'gram')).toBeCloseTo(1000)
  })

  it('converts imperial volume', () => {
    expect(convertUnit(1, 'tablespoon', 'teaspoon')).toBeCloseTo(3)
    expect(convertUnit(1, 'cup', 'tablespoon')).toBeCloseTo(16)
  })

  it('converts between metric and imperial weight', () => {
    expect(convertUnit(1, 'pound', 'gram')).toBeCloseTo(453.592, 0)
    expect(convertUnit(1, 'ounce', 'gram')).toBeCloseTo(28.3495, 0)
  })

  it('returns null for incompatible units', () => {
    expect(convertUnit(1, 'gram', 'litre')).toBeNull()
    expect(convertUnit(1, 'cup', 'kilogram')).toBeNull()
  })

  it('returns null for unknown units', () => {
    expect(convertUnit(1, 'bunch', 'gram')).toBeNull()
  })
})
