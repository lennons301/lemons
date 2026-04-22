import { describe, it, expect, vi } from 'vitest'
import { getRecipe } from './get-recipe'
import type { ToolContext } from '../types'

function fakeContext(recipeData: any, ingredientData: any[] = []) {
  const supabase: any = {
    from: vi.fn((table: string) => {
      if (table === 'recipes') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: recipeData, error: null })),
              })),
            })),
          })),
        }
      }
      if (table === 'recipe_ingredients') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: ingredientData, error: null })),
            })),
          })),
        }
      }
      throw new Error('unexpected table ' + table)
    }),
  }
  return { supabase, householdId: 'h1', userId: 'u1', conversationId: 'c1' } as unknown as ToolContext
}

describe('getRecipe', () => {
  it('returns the recipe with ingredients', async () => {
    const ctx = fakeContext(
      { id: 'r1', title: 'Curry', description: null, servings: 4, prep_time: 10, cook_time: 30, instructions: ['step 1'] },
      [{ raw_text: '1 onion', quantity: 1, unit: null, name: 'onion', notes: null, optional: false }],
    )
    const result = await getRecipe(ctx, { recipe_id: 'r1' })
    expect(result.is_error).toBeFalsy()
    expect(result.content).toMatchObject({
      id: 'r1',
      title: 'Curry',
      servings: 4,
      ingredients: [{ name: 'onion', quantity: 1 }],
    })
  })

  it('returns an error tool result when recipe not found', async () => {
    const ctx = fakeContext(null)
    const result = await getRecipe(ctx, { recipe_id: 'missing' })
    expect(result.is_error).toBe(true)
  })
})
