/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { buildShoppingFromDrafts } from './shopping-for-drafts'

function fakeSupabase(tables: Record<string, any>) {
  return {
    from: vi.fn((name: string) => {
      if (!tables[name]) throw new Error(`no fake for ${name}`)
      return tables[name]
    }),
  } as any
}

describe('buildShoppingFromDrafts', () => {
  it('returns empty items when conversation has no drafts', async () => {
    const supabase = fakeSupabase({
      meal_gen_conversations: {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { id: 'c1', household_id: 'h1' }, error: null }),
          }),
        }),
      },
      meal_gen_drafts: {
        select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
      },
      recipes: { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) },
      household_staples: {
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      },
      packet_sizes: {
        select: () => ({
          or: () => ({ in: () => Promise.resolve({ data: [], error: null }) }),
        }),
      },
    })
    const result = await buildShoppingFromDrafts(supabase, 'c1')
    expect(result!.items).toEqual([])
    expect(result!.totals.line_count).toBe(0)
  })

  it('aggregates recipe ingredients across drafts and rounds to packets', async () => {
    const supabase = fakeSupabase({
      meal_gen_conversations: {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { id: 'c1', household_id: 'h1' }, error: null }),
          }),
        }),
      },
      meal_gen_drafts: {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({
              data: [
                { id: 'd1', date: '2026-04-22', meal_type: 'dinner', source: 'recipe', recipe_id: 'r1', custom_ingredients: null, servings: 4, inventory_item_id: null, custom_name: null },
                { id: 'd2', date: '2026-04-23', meal_type: 'dinner', source: 'recipe', recipe_id: 'r1', custom_ingredients: null, servings: 4, inventory_item_id: null, custom_name: null },
              ],
              error: null,
            }),
          }),
        }),
      },
      recipes: {
        select: () => ({
          in: () => Promise.resolve({
            data: [
              {
                id: 'r1',
                servings: 4,
                recipe_ingredients: [
                  { name: 'carrot', quantity: 300, unit: 'g' },
                ],
              },
            ],
            error: null,
          }),
        }),
      },
      household_staples: {
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      },
      packet_sizes: {
        select: () => ({
          or: () => ({
            in: () => Promise.resolve({
              data: [
                { ingredient_name: 'carrot', pack_quantity: 500, pack_unit: 'g', is_default: false, household_id: null },
                { ingredient_name: 'carrot', pack_quantity: 1, pack_unit: 'kg', is_default: true, household_id: null },
              ],
              error: null,
            }),
          }),
        }),
      },
    })

    const result = await buildShoppingFromDrafts(supabase, 'c1')
    expect(result!.items).toHaveLength(1)
    expect(result!.items[0].name).toBe('carrot')
    expect(result!.items[0].required_qty).toBe(600)
    expect(result!.items[0].packed_qty).toBe(1000)
    expect(result!.items[0].pack_size).toEqual({ quantity: 1, unit: 'kg' })
    expect(result!.totals.waste_qty_total).toBeCloseTo(400)
  })

  it('includes custom_with_ingredients entries as ingredient sources', async () => {
    const supabase = fakeSupabase({
      meal_gen_conversations: {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: { id: 'c1', household_id: 'h1' }, error: null }),
          }),
        }),
      },
      meal_gen_drafts: {
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({
              data: [
                {
                  id: 'd1',
                  date: '2026-04-22',
                  meal_type: 'dinner',
                  source: 'custom_with_ingredients',
                  recipe_id: null,
                  custom_ingredients: [{ name: 'tortilla', quantity: 8, unit: 'ct' }],
                  servings: 4,
                  inventory_item_id: null,
                  custom_name: 'DIY tacos',
                },
              ],
              error: null,
            }),
          }),
        }),
      },
      recipes: { select: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) },
      household_staples: {
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      },
      packet_sizes: {
        select: () => ({ or: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
      },
    })

    const result = await buildShoppingFromDrafts(supabase, 'c1')
    expect(result!.items).toHaveLength(1)
    expect(result!.items[0].name).toBe('tortilla')
  })

  it('returns null when conversation not found', async () => {
    const supabase = fakeSupabase({
      meal_gen_conversations: {
        select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      },
    })
    const result = await buildShoppingFromDrafts(supabase, 'missing')
    expect(result).toBeNull()
  })
})
