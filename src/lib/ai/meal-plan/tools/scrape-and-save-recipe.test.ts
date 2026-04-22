/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExtract } = vi.hoisted(() => ({ mockExtract: vi.fn() }))
vi.mock('@/lib/ai/extract-recipe-from-url', () => ({
  extractRecipeFromUrl: mockExtract,
}))

import { scrapeAndSaveRecipe } from './scrape-and-save-recipe'
import type { ToolContext } from '../types'

function fakeContext(options: {
  existing?: { id: string; title?: string } | null
  insertedRecipe?: { id: string }
  insertError?: any
}) {
  const recipesMaybeSingle = vi.fn(() => Promise.resolve({ data: options.existing ?? null, error: null }))
  const recipesInsertSingle = vi.fn(() =>
    Promise.resolve({ data: options.insertedRecipe, error: options.insertError ?? null }),
  )
  const ingInsert = vi.fn(() => Promise.resolve({ data: null, error: null }))

  const householdMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }))

  const supabase: any = {
    from: vi.fn((table: string) => {
      if (table === 'recipes') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: recipesMaybeSingle,
              })),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({ single: recipesInsertSingle })),
          })),
        }
      }
      if (table === 'recipe_ingredients') {
        return { insert: ingInsert }
      }
      if (table === 'households') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: householdMaybeSingle,
            })),
          })),
        }
      }
      throw new Error('unexpected ' + table)
    }),
  }
  return {
    ctx: { supabase, householdId: 'h1', userId: 'u1', conversationId: 'c1' } as unknown as ToolContext,
    ingInsert,
    recipesInsertSingle,
  }
}

describe('scrapeAndSaveRecipe', () => {
  beforeEach(() => {
    mockExtract.mockReset()
  })

  it('returns existing recipe_id for a duplicate source_url without re-scraping', async () => {
    const { ctx } = fakeContext({ existing: { id: 'existing-r1', title: 'Existing Recipe' } })
    const result = await scrapeAndSaveRecipe(ctx, { url: 'https://example.com/r' })
    expect(result.content).toMatchObject({ recipe_id: 'existing-r1', reused: true })
    expect(mockExtract).not.toHaveBeenCalled()
  })

  it('scrapes, inserts recipe and ingredients, returns new id', async () => {
    mockExtract.mockResolvedValue({
      title: 'Lemon Salmon',
      description: null,
      servings: 2,
      prep_time: 10,
      cook_time: 20,
      instructions: ['Bake'],
      ingredients: [{ raw_text: '2 salmon fillets', quantity: 2, unit: null, name: 'salmon fillet', notes: null }],
      tags: [],
      source_author: null,
      source_book: null,
      hero_image: null,
    })
    const { ctx, ingInsert, recipesInsertSingle } = fakeContext({ insertedRecipe: { id: 'new-r2' } })
    const result = await scrapeAndSaveRecipe(ctx, { url: 'https://example.com/r' })
    expect(result.content).toMatchObject({ recipe_id: 'new-r2', reused: false })
    expect(recipesInsertSingle).toHaveBeenCalledOnce()
    expect(ingInsert).toHaveBeenCalledOnce()
  })

  it('returns error on scrape failure', async () => {
    mockExtract.mockRejectedValue(new Error('Failed to fetch https://...: 404'))
    const { ctx } = fakeContext({})
    const result = await scrapeAndSaveRecipe(ctx, { url: 'https://example.com/missing' })
    expect(result.is_error).toBe(true)
  })
})
