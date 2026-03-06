import { describe, it, expect } from 'vitest'
import { normalizeName, parseIngredientText } from './ingredients'

describe('normalizeName', () => {
  it('lowercases', () => {
    expect(normalizeName('Onion')).toBe('onion')
  })

  it('trims whitespace', () => {
    expect(normalizeName('  garlic  ')).toBe('garlic')
  })

  it('strips common adjectives', () => {
    expect(normalizeName('large red onion')).toBe('red onion')
    expect(normalizeName('small fresh tomatoes')).toBe('tomato')
    expect(normalizeName('medium ripe avocado')).toBe('avocado')
  })

  it('singularizes common plurals', () => {
    expect(normalizeName('onions')).toBe('onion')
    expect(normalizeName('tomatoes')).toBe('tomato')
    expect(normalizeName('potatoes')).toBe('potato')
    expect(normalizeName('berries')).toBe('berry')
    expect(normalizeName('leaves')).toBe('leaf')
  })

  it('handles already-singular names', () => {
    expect(normalizeName('rice')).toBe('rice')
    expect(normalizeName('garlic')).toBe('garlic')
  })
})

describe('parseIngredientText', () => {
  it('parses "2 onions"', () => {
    const result = parseIngredientText('2 onions')
    expect(result.quantity).toBe(2)
    expect(result.unit).toBeNull()
    expect(result.name).toBe('onion')
  })

  it('parses "400ml coconut milk"', () => {
    const result = parseIngredientText('400ml coconut milk')
    expect(result.quantity).toBe(400)
    expect(result.unit).toBe('millilitre')
    expect(result.name).toBe('coconut milk')
  })

  it('parses "1 tbsp olive oil"', () => {
    const result = parseIngredientText('1 tbsp olive oil')
    expect(result.quantity).toBe(1)
    expect(result.unit).toBe('tablespoon')
    expect(result.name).toBe('olive oil')
  })

  it('parses "salt to taste" (no quantity)', () => {
    const result = parseIngredientText('salt to taste')
    expect(result.quantity).toBeNull()
    expect(result.unit).toBeNull()
    expect(result.name).toBe('salt')
    expect(result.notes).toBe('to taste')
  })

  it('parses "2 large onions, diced"', () => {
    const result = parseIngredientText('2 large onions, diced')
    expect(result.quantity).toBe(2)
    expect(result.name).toBe('onion')
    expect(result.notes).toBe('diced')
  })

  it('parses fractions like "1/2 cup flour"', () => {
    const result = parseIngredientText('1/2 cup flour')
    expect(result.quantity).toBe(0.5)
    expect(result.unit).toBe('cup')
    expect(result.name).toBe('flour')
  })

  it('parses "1 1/2 tsp salt"', () => {
    const result = parseIngredientText('1 1/2 tsp salt')
    expect(result.quantity).toBe(1.5)
    expect(result.unit).toBe('teaspoon')
    expect(result.name).toBe('salt')
  })
})
