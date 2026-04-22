/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { acceptConversation } from './accept'

function fakeContext(params: {
  conversation: any
  drafts: any[]
  insertResult?: { data: any[]; error: any }
}) {
  const conversationFetch = vi.fn(() => Promise.resolve({ data: params.conversation, error: null }))
  const draftsFetch = vi.fn(() => Promise.resolve({ data: params.drafts, error: null }))
  const insertRows = vi.fn(() => ({
    select: vi.fn(() => Promise.resolve(params.insertResult ?? { data: [{ id: 'new-1' }], error: null })),
  }))
  const updateChain = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
  const deleteChain = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))

  const supabase: any = {
    from: vi.fn((t: string) => {
      if (t === 'meal_gen_conversations') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: conversationFetch }) }),
          update: updateChain,
        }
      }
      if (t === 'meal_gen_drafts') {
        return {
          select: () => ({ eq: () => ({ order: draftsFetch }) }),
          delete: deleteChain,
        }
      }
      if (t === 'meal_plan_entries') {
        return { insert: insertRows }
      }
      throw new Error('unexpected table ' + t)
    }),
  }
  return { supabase, insertRows, updateChain }
}

describe('acceptConversation', () => {
  it('promotes each draft to a meal_plan_entries row with correct mapping by source', async () => {
    const { supabase, insertRows, updateChain } = fakeContext({
      conversation: { id: 'c1', household_id: 'h1', status: 'active' },
      drafts: [
        { id: 'd1', date: '2026-04-22', meal_type: 'dinner', source: 'recipe', recipe_id: 'r1', inventory_item_id: null, custom_name: null, custom_ingredients: null, servings: 4, assigned_to: [], notes: null },
        { id: 'd2', date: '2026-04-23', meal_type: 'dinner', source: 'custom', recipe_id: null, inventory_item_id: null, custom_name: 'Takeaway', custom_ingredients: null, servings: 4, assigned_to: [], notes: 'pizza night' },
        { id: 'd3', date: '2026-04-24', meal_type: 'dinner', source: 'custom_with_ingredients', recipe_id: null, inventory_item_id: null, custom_name: 'DIY tacos', custom_ingredients: [{ name: 'tortilla', quantity: 8, unit: 'ct' }], servings: 4, assigned_to: [], notes: null },
        { id: 'd4', date: '2026-04-25', meal_type: 'dinner', source: 'leftover', recipe_id: null, inventory_item_id: 'i1', custom_name: null, custom_ingredients: null, servings: 2, assigned_to: [], notes: null },
      ],
    })

    await acceptConversation(supabase, 'c1', 'u1')

    expect(insertRows).toHaveBeenCalledOnce()
    const rowsArg = insertRows.mock.calls[0][0]
    expect(rowsArg).toHaveLength(4)
    expect(rowsArg[0]).toMatchObject({ household_id: 'h1', date: '2026-04-22', meal_type: 'dinner', recipe_id: 'r1', custom_name: null })
    expect(rowsArg[1]).toMatchObject({ custom_name: 'Takeaway', recipe_id: null })
    expect(rowsArg[2]).toMatchObject({ custom_name: 'DIY tacos', custom_ingredients: [{ name: 'tortilla', quantity: 8, unit: 'ct' }] })
    expect(rowsArg[3]).toMatchObject({ inventory_item_id: 'i1', recipe_id: null, custom_name: null })

    expect(updateChain).toHaveBeenCalledWith(expect.objectContaining({
      status: 'accepted',
      accepted_at: expect.any(String),
    }))
  })

  it('rejects if conversation is already accepted', async () => {
    const { supabase } = fakeContext({
      conversation: { id: 'c1', household_id: 'h1', status: 'accepted' },
      drafts: [],
    })
    await expect(acceptConversation(supabase, 'c1', 'u1')).rejects.toThrow(/already/)
  })

  it('rejects if there are no drafts', async () => {
    const { supabase } = fakeContext({
      conversation: { id: 'c1', household_id: 'h1', status: 'active' },
      drafts: [],
    })
    await expect(acceptConversation(supabase, 'c1', 'u1')).rejects.toThrow(/no drafts/i)
  })
})
