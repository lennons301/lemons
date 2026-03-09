import { describe, it, expect } from 'vitest'
import { aggregateIngredients, type MealPlanIngredient } from './aggregate-ingredients'

describe('aggregateIngredients', () => {
  it('sums same ingredient with same unit', () => {
    const items: MealPlanIngredient[] = [
      { name: 'onion', quantity: 2, unit: 'unit', servings: 4, recipeServings: 4 },
      { name: 'onion', quantity: 3, unit: 'unit', servings: 4, recipeServings: 4 },
    ]
    const result = aggregateIngredients(items)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('onion')
    expect(result[0].quantity).toBe(5)
    expect(result[0].unit).toBe('unit')
  })

  it('scales by servings before aggregating', () => {
    const items: MealPlanIngredient[] = [
      { name: 'flour', quantity: 200, unit: 'g', servings: 8, recipeServings: 4 },
    ]
    const result = aggregateIngredients(items)
    expect(result[0].quantity).toBe(400)
  })

  it('converts compatible units before summing', () => {
    const items: MealPlanIngredient[] = [
      { name: 'flour', quantity: 2, unit: 'cup', servings: 4, recipeServings: 4 },
      { name: 'flour', quantity: 100, unit: 'g', servings: 4, recipeServings: 4 },
    ]
    const result = aggregateIngredients(items)
    // cup is volume, g is weight — incompatible, so separate lines
    expect(result).toHaveLength(2)
  })

  it('converts ml and cup into common unit', () => {
    const items: MealPlanIngredient[] = [
      { name: 'milk', quantity: 1, unit: 'cup', servings: 4, recipeServings: 4 },
      { name: 'milk', quantity: 500, unit: 'ml', servings: 4, recipeServings: 4 },
    ]
    const result = aggregateIngredients(items)
    expect(result).toHaveLength(1)
    // 1 cup = 236.588ml, total ≈ 736.588ml — presented in ml
    expect(result[0].unit).toBe('millilitre')
    expect(result[0].quantity).toBeCloseTo(736.588, 0)
  })

  it('converts tsp and tbsp', () => {
    const items: MealPlanIngredient[] = [
      { name: 'salt', quantity: 3, unit: 'tsp', servings: 4, recipeServings: 4 },
      { name: 'salt', quantity: 1, unit: 'tbsp', servings: 4, recipeServings: 4 },
    ]
    const result = aggregateIngredients(items)
    expect(result).toHaveLength(1)
    // 3 tsp ≈ 14.79ml, 1 tbsp ≈ 14.79ml, total ≈ 29.57ml
    expect(result[0].unit).toBe('millilitre')
    expect(result[0].quantity).toBeCloseTo(29.57, 0)
  })

  it('converts g and kg', () => {
    const items: MealPlanIngredient[] = [
      { name: 'chicken', quantity: 500, unit: 'g', servings: 4, recipeServings: 4 },
      { name: 'chicken', quantity: 1, unit: 'kg', servings: 4, recipeServings: 4 },
    ]
    const result = aggregateIngredients(items)
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBeCloseTo(1500, 0)
    expect(result[0].unit).toBe('gram')
  })

  it('keeps items with no quantity as-is', () => {
    const items: MealPlanIngredient[] = [
      { name: 'salt', quantity: null, unit: null, servings: 4, recipeServings: 4 },
      { name: 'salt', quantity: null, unit: null, servings: 2, recipeServings: 2 },
    ]
    const result = aggregateIngredients(items)
    // Can't sum null quantities — keep one entry
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBeNull()
  })

  it('keeps items with unknown units separate', () => {
    const items: MealPlanIngredient[] = [
      { name: 'basil', quantity: 1, unit: 'bunch', servings: 4, recipeServings: 4 },
      { name: 'basil', quantity: 2, unit: 'bunch', servings: 4, recipeServings: 4 },
    ]
    const result = aggregateIngredients(items)
    expect(result).toHaveLength(1)
    expect(result[0].quantity).toBe(3)
    expect(result[0].unit).toBe('bunch')
  })

  it('handles empty input', () => {
    expect(aggregateIngredients([])).toEqual([])
  })
})
