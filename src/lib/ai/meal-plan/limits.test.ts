/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import type { MealGenMessage } from '@/types/meal-gen'
import {
  isConversationAtMessageCap,
  countToolCalls,
  isConversationAtToolCallCap,
  isHouseholdAtDailyCap,
} from './limits'

function msg(role: 'user' | 'assistant' | 'tool', tool_calls = 0): MealGenMessage {
  return {
    role,
    content: '',
    tool_calls: Array.from({ length: tool_calls }, (_, i) => ({ id: `t${i}`, name: 'get_recipe' as const, input: {} })),
    ts: '2026-04-21T00:00:00Z',
  }
}

describe('isConversationAtMessageCap', () => {
  it('false when under cap', () => {
    const messages: MealGenMessage[] = Array(10).fill(msg('user'))
    expect(isConversationAtMessageCap(messages)).toBe(false)
  })
  it('true when at or over cap', () => {
    const messages: MealGenMessage[] = Array(50).fill(msg('user'))
    expect(isConversationAtMessageCap(messages)).toBe(true)
  })
})

describe('countToolCalls', () => {
  it('sums tool_calls across assistant messages', () => {
    const messages: MealGenMessage[] = [msg('assistant', 2), msg('user'), msg('assistant', 3)]
    expect(countToolCalls(messages)).toBe(5)
  })
})

describe('isConversationAtToolCallCap', () => {
  it('true when total tool calls >= cap', () => {
    const messages: MealGenMessage[] = [msg('assistant', 20)]
    expect(isConversationAtToolCallCap(messages)).toBe(true)
  })
})

describe('isHouseholdAtDailyCap', () => {
  it('returns true when >= 20 conversations created today', async () => {
    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => Promise.resolve({ count: 20, error: null }),
          }),
        }),
      }),
    }
    expect(await isHouseholdAtDailyCap(supabase, 'h1')).toBe(true)
  })

  it('returns false when count is under cap', async () => {
    const supabase: any = {
      from: () => ({
        select: () => ({
          eq: () => ({
            gte: () => Promise.resolve({ count: 5, error: null }),
          }),
        }),
      }),
    }
    expect(await isHouseholdAtDailyCap(supabase, 'h1')).toBe(false)
  })
})
