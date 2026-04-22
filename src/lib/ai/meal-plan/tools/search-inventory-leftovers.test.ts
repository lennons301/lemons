import { describe, it, expect } from 'vitest'
import { searchInventoryLeftovers } from './search-inventory-leftovers'
import type { ToolContext } from '../types'

const ctx: ToolContext = {
  supabase: {} as any,
  householdId: 'h1',
  userId: 'u1',
  conversationId: 'c1',
}

describe('searchInventoryLeftovers (stubbed)', () => {
  it('returns empty array (cooked-meal columns not yet on inventory_items)', async () => {
    const result = await searchInventoryLeftovers(ctx, {})
    expect(result.content).toEqual([])
    expect(result.is_error).toBeFalsy()
  })
})
