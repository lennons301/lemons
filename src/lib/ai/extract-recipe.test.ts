import { describe, it, expect } from 'vitest'
import { validateExtractionResult, type ExtractionResult } from './extract-recipe'

describe('validateExtractionResult', () => {
  it('validates a correct extraction result', () => {
    const input: ExtractionResult = {
      title: 'Chicken Curry',
      description: 'A simple chicken curry',
      servings: 4,
      prep_time: 15,
      cook_time: 30,
      ingredients: [
        { raw_text: '500g chicken breast', quantity: 500, unit: 'g', name: 'chicken breast', notes: null },
        { raw_text: '1 onion, diced', quantity: 1, unit: null, name: 'onion', notes: 'diced' },
      ],
      instructions: ['Dice the chicken', 'Fry the onion', 'Add spices', 'Simmer'],
      tags: ['curry', 'chicken', 'dinner'],
    }
    const result = validateExtractionResult(input)
    expect(result.title).toBe('Chicken Curry')
    expect(result.ingredients).toHaveLength(2)
    expect(result.instructions).toHaveLength(4)
  })

  it('provides defaults for missing optional fields', () => {
    const input = {
      title: 'Test Recipe',
      ingredients: [{ raw_text: 'some ingredient' }],
      instructions: ['Step 1'],
    }
    const result = validateExtractionResult(input as any)
    expect(result.servings).toBe(4)
    expect(result.description).toBeNull()
    expect(result.prep_time).toBeNull()
    expect(result.cook_time).toBeNull()
    expect(result.tags).toEqual([])
  })

  it('throws for missing title', () => {
    const input = { ingredients: [], instructions: [] }
    expect(() => validateExtractionResult(input as any)).toThrow()
  })

  it('throws for empty ingredients', () => {
    const input = { title: 'Test', ingredients: [], instructions: ['Step 1'] }
    expect(() => validateExtractionResult(input as any)).toThrow()
  })

  it('throws for empty instructions', () => {
    const input = { title: 'Test', ingredients: [{ raw_text: 'foo' }], instructions: [] }
    expect(() => validateExtractionResult(input as any)).toThrow()
  })
})
