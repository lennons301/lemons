/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { appendMessages } from './persist'
import type { MealGenMessage } from '@/types/meal-gen'

function userMsg(content: string): MealGenMessage {
  return { role: 'user', content, ts: '2026-04-21T00:00:00Z' }
}
function assistantMsg(content: string): MealGenMessage {
  return { role: 'assistant', content, ts: '2026-04-21T00:00:00Z' }
}

describe('appendMessages', () => {
  it('appends to existing messages, bumps last_activity_at, accumulates token counts', async () => {
    const existingMessages = [userMsg('hi')]
    const existingMetadata = { tokens_in: 100, tokens_out: 50 }
    const fetch = vi.fn(() => Promise.resolve({
      data: { messages: existingMessages, metadata: existingMetadata },
      error: null,
    }))
    const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }))
    const supabase: any = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: fetch }) }),
        update,
      }),
    }

    await appendMessages(supabase, 'c1', [userMsg('plan'), assistantMsg('ok')], 200, 30)

    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: 'hi' }),
        expect.objectContaining({ role: 'user', content: 'plan' }),
        expect.objectContaining({ role: 'assistant', content: 'ok' }),
      ]),
      metadata: expect.objectContaining({ tokens_in: 300, tokens_out: 80 }),
      last_activity_at: expect.any(String),
    }))
  })
})
