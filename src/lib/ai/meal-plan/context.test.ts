/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { loadConversationContext } from './context'

function fakeSupabase(tables: Record<string, any>) {
  return {
    from: vi.fn((name: string) => {
      if (!tables[name]) throw new Error(`no fake for ${name}`)
      return tables[name]
    }),
  } as any
}

describe('loadConversationContext', () => {
  it('loads conversation, members, staples, recipes, and recipe tags', async () => {
    const supabase = fakeSupabase({
      meal_gen_conversations: {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { id: 'c1', household_id: 'h1', created_by: 'u1', week_start: '2026-04-20', messages: [], status: 'active', accepted_at: null, last_activity_at: '', metadata: {}, created_at: '' },
              error: null,
            }),
          }),
        }),
      },
      households: {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({
              data: { anthropic_api_key: 'sk-test' },
              error: null,
            }),
          }),
        }),
      },
      household_persons: {
        select: () => ({
          eq: () => Promise.resolve({
            data: [
              { id: 'p1', display_name: 'Sean', date_of_birth: null, person_type: 'member' },
              { id: 'p2', display_name: 'Kid1', date_of_birth: '2019-03-01', person_type: 'managed_member' },
            ],
            error: null,
          }),
        }),
      },
      household_staples: {
        select: () => ({
          eq: () => Promise.resolve({ data: [{ name: 'olive oil' }, { name: 'salt' }], error: null }),
        }),
      },
      recipes: {
        select: () => ({
          eq: () => Promise.resolve({
            data: [
              { id: 'r1', title: 'Curry', recipe_tags: [{ tag_name: 'spicy' }, { tag_name: 'dinner' }] },
              { id: 'r2', title: 'Pasta', recipe_tags: [] },
            ],
            error: null,
          }),
        }),
      },
    })

    const result = await loadConversationContext(supabase, 'c1')
    expect(result).not.toBeNull()
    expect(result!.conversation.id).toBe('c1')
    expect(result!.apiKey).toBe('sk-test')
    expect(result!.household.members.length).toBe(2)
    expect(result!.household.members[0]).toMatchObject({ name: 'Sean', role: 'adult' })
    expect(result!.household.members[1]).toMatchObject({ name: 'Kid1', role: 'managed' })
    expect(result!.household.staples).toEqual(['olive oil', 'salt'])
    expect(result!.catalogRecipes.length).toBe(2)
    expect(result!.catalogRecipes[0]).toMatchObject({ id: 'r1', title: 'Curry', tags: ['spicy', 'dinner'] })
  })

  it('returns null when conversation is not found', async () => {
    const supabase = fakeSupabase({
      meal_gen_conversations: {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      },
    })
    const result = await loadConversationContext(supabase, 'missing')
    expect(result).toBeNull()
  })
})
