import { describe, it, expect, vi } from 'vitest'
import { proposePlan } from './propose-plan'
import type { ToolContext } from '../types'

function fakeContext(upsertResult: { data: any; error: any }) {
  const upsert = vi.fn(() => ({
    select: vi.fn(() => Promise.resolve(upsertResult)),
  }))
  const supabase: any = {
    from: vi.fn(() => ({ upsert })),
  }
  return {
    ctx: { supabase, householdId: 'h1', userId: 'u1', conversationId: 'c1' } as unknown as ToolContext,
    upsert,
  }
}

describe('proposePlan', () => {
  it('upserts entries with source=recipe, writes recipe_id only', async () => {
    const { ctx, upsert } = fakeContext({
      data: [{ id: 'd1', date: '2026-04-22', meal_type: 'dinner' }],
      error: null,
    })
    const result = await proposePlan(ctx, {
      entries: [
        { date: '2026-04-22', meal_type: 'dinner', source: 'recipe', recipe_id: 'r1', servings: 4 },
      ],
    })
    expect(result.is_error).toBeFalsy()
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          conversation_id: 'c1',
          date: '2026-04-22',
          meal_type: 'dinner',
          source: 'recipe',
          recipe_id: 'r1',
          inventory_item_id: null,
          custom_name: null,
          custom_ingredients: null,
          servings: 4,
        }),
      ],
      expect.objectContaining({ onConflict: 'conversation_id,date,meal_type' }),
    )
  })

  it('rejects recipe source without recipe_id', async () => {
    const { ctx } = fakeContext({ data: null, error: null })
    const result = await proposePlan(ctx, {
      entries: [{ date: '2026-04-22', meal_type: 'dinner', source: 'recipe' }],
    })
    expect(result.is_error).toBe(true)
  })

  it('rejects custom_with_ingredients source without both custom_name and custom_ingredients', async () => {
    const { ctx } = fakeContext({ data: null, error: null })
    const result = await proposePlan(ctx, {
      entries: [{ date: '2026-04-22', meal_type: 'dinner', source: 'custom_with_ingredients', custom_name: 'DIY tacos' }],
    })
    expect(result.is_error).toBe(true)
  })
})
