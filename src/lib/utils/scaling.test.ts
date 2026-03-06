import { describe, it, expect } from 'vitest'
import { scaleQuantity, scaleIngredients } from './scaling'

describe('scaleQuantity', () => {
  it('scales proportionally', () => {
    expect(scaleQuantity(2, 4, 8)).toBe(4) // double servings, double quantity
    expect(scaleQuantity(1, 4, 2)).toBe(0.5) // halve servings, halve quantity
    expect(scaleQuantity(3, 4, 4)).toBe(3) // same servings, same quantity
  })

  it('returns null for null quantity', () => {
    expect(scaleQuantity(null, 4, 8)).toBeNull()
  })

  it('rounds to 2 decimal places', () => {
    expect(scaleQuantity(1, 3, 7)).toBe(2.33)
  })

  it('handles zero base servings gracefully', () => {
    expect(scaleQuantity(1, 0, 4)).toBeNull()
  })
})

describe('scaleIngredients', () => {
  const ingredients = [
    { id: '1', recipe_id: 'r1', raw_text: '2 onions', quantity: 2, unit: null, name: 'onion', group: null, optional: false, notes: null, sort_order: 0 },
    { id: '2', recipe_id: 'r1', raw_text: '400ml coconut milk', quantity: 400, unit: 'millilitre', name: 'coconut milk', group: null, optional: false, notes: null, sort_order: 1 },
    { id: '3', recipe_id: 'r1', raw_text: 'salt to taste', quantity: null, unit: null, name: 'salt', group: null, optional: true, notes: 'to taste', sort_order: 2 },
  ]

  it('scales all ingredients with quantities', () => {
    const scaled = scaleIngredients(ingredients, 4, 8)
    expect(scaled[0].quantity).toBe(4)
    expect(scaled[1].quantity).toBe(800)
    expect(scaled[2].quantity).toBeNull()
  })

  it('preserves non-quantity fields', () => {
    const scaled = scaleIngredients(ingredients, 4, 8)
    expect(scaled[0].name).toBe('onion')
    expect(scaled[0].raw_text).toBe('2 onions')
    expect(scaled[2].notes).toBe('to taste')
  })
})
