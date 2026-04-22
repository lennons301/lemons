/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { checkPacketSizes } from './check-packet-sizes'
import type { ToolContext } from '../types'

function fakeContext(rows: any[]) {
  const chain = {
    in: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  }
  const supabase: any = {
    from: vi.fn(() => ({ select: vi.fn(() => chain) })),
  }
  return {
    supabase,
    householdId: 'h1',
    userId: 'u1',
    conversationId: 'c1',
  } as unknown as ToolContext
}

describe('checkPacketSizes', () => {
  it('groups rows by ingredient and returns compact output', async () => {
    const ctx = fakeContext([
      { ingredient_name: 'carrot', pack_quantity: 1, pack_unit: 'kg', is_default: true },
      { ingredient_name: 'carrot', pack_quantity: 500, pack_unit: 'g', is_default: false },
      { ingredient_name: 'onion', pack_quantity: 3, pack_unit: 'ct', is_default: true },
    ])
    const result = await checkPacketSizes(ctx, { ingredient_names: ['carrot', 'onion'] })
    expect(result.content).toEqual([
      {
        name: 'carrot',
        packs: [
          { quantity: 1, unit: 'kg', is_default: true },
          { quantity: 500, unit: 'g', is_default: false },
        ],
      },
      { name: 'onion', packs: [{ quantity: 3, unit: 'ct', is_default: true }] },
    ])
  })

  it('returns empty packs list for unknown ingredients', async () => {
    const ctx = fakeContext([])
    const result = await checkPacketSizes(ctx, { ingredient_names: ['dragonfruit'] })
    expect(result.content).toEqual([{ name: 'dragonfruit', packs: [] }])
  })
})
