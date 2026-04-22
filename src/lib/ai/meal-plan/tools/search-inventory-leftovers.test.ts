import { describe, it, expect, vi } from 'vitest'
import { searchInventoryLeftovers } from './search-inventory-leftovers'
import type { ToolContext } from '../types'

function fakeContext(rows: any[]) {
  const supabase: any = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            gt: vi.fn(() => Promise.resolve({ data: rows, error: null })),
          })),
        })),
      })),
    })),
  }
  return { supabase, householdId: 'h1', userId: 'u1', conversationId: 'c1' } as unknown as ToolContext
}

describe('searchInventoryLeftovers', () => {
  it('returns cooked-meal items with remaining servings', async () => {
    const ctx = fakeContext([
      { id: 'i1', display_name: 'Chili con carne', cooked_servings: 3, source_recipe_id: 'r1', expiry_date: '2026-05-01' },
    ])
    const result = await searchInventoryLeftovers(ctx, {})
    expect(result.content).toEqual([
      { id: 'i1', name: 'Chili con carne', servings_available: 3, source_recipe_id: 'r1', expiry_date: '2026-05-01' },
    ])
  })

  it('returns empty array when there are no leftovers (inventory unpopulated)', async () => {
    const ctx = fakeContext([])
    const result = await searchInventoryLeftovers(ctx, {})
    expect(result.content).toEqual([])
  })
})
