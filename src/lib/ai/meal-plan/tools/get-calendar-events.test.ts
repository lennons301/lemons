import { describe, it, expect, vi } from 'vitest'
import { getCalendarEvents } from './get-calendar-events'
import type { ToolContext } from '../types'

function fakeContext(rows: any[]) {
  const supabase: any = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(() => ({
            lte: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
            })),
          })),
        })),
      })),
    })),
  }
  return { supabase, householdId: 'h1', userId: 'u1', conversationId: 'c1' } as unknown as ToolContext
}

describe('getCalendarEvents', () => {
  it('returns events in the window', async () => {
    const ctx = fakeContext([
      { id: 'e1', title: 'Swim club', start_datetime: '2026-04-22T17:00:00Z', end_datetime: '2026-04-22T18:30:00Z', all_day: false, category: 'appointment' },
    ])
    const result = await getCalendarEvents(ctx, { from: '2026-04-20', to: '2026-04-26' })
    expect(result.content).toHaveLength(1)
    expect((result.content as any)[0]).toMatchObject({ id: 'e1', title: 'Swim club' })
  })

  it('rejects bad dates', async () => {
    const ctx = fakeContext([])
    const result = await getCalendarEvents(ctx, { from: 'not-a-date', to: '2026-04-26' })
    expect(result.is_error).toBe(true)
  })
})
