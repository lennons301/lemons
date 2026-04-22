/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { removeSlot } from './remove-slot'
import type { ToolContext } from '../types'

function fakeContext() {
  const third = vi.fn(() => Promise.resolve({ error: null }))
  const second = vi.fn(() => ({ eq: third }))
  const first = vi.fn(() => ({ eq: second }))
  const del = vi.fn(() => ({ eq: first }))
  const supabase: any = { from: vi.fn(() => ({ delete: del })) }
  return {
    ctx: { supabase, householdId: 'h1', userId: 'u1', conversationId: 'c1' } as unknown as ToolContext,
    first,
    second,
    third,
  }
}

describe('removeSlot', () => {
  it('deletes the draft slot scoped to the conversation', async () => {
    const { ctx, first, second, third } = fakeContext()
    await removeSlot(ctx, { date: '2026-04-22', meal_type: 'dinner' })
    expect(first).toHaveBeenCalledWith('conversation_id', 'c1')
    expect(second).toHaveBeenCalledWith('date', '2026-04-22')
    expect(third).toHaveBeenCalledWith('meal_type', 'dinner')
  })
})
