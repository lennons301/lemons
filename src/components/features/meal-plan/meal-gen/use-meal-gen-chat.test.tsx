/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMealGenChat } from './use-meal-gen-chat'

describe('useMealGenChat', () => {
  const household_id = 'h1'
  const week_start = '2026-04-20'

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function mockFetchSequence(responses: Array<{ ok: boolean; status?: number; body: any }>) {
    let i = 0
    global.fetch = vi.fn(() => {
      const r = responses[i++]
      return Promise.resolve({
        ok: r.ok,
        status: r.status ?? (r.ok ? 200 : 500),
        json: () => Promise.resolve(r.body),
      }) as any
    }) as any
  }

  it('start() creates a conversation and sets conversationId', async () => {
    mockFetchSequence([{ ok: true, body: { id: 'c1', status: 'active' } }])
    const { result } = renderHook(() => useMealGenChat({ household_id, week_start }))

    await act(async () => {
      await result.current.start()
    })

    expect(result.current.conversationId).toBe('c1')
    expect(result.current.status).toBe('active')
    expect(result.current.error).toBeNull()
  })

  it('send() posts a message and appends assistant messages + drafts', async () => {
    mockFetchSequence([
      { ok: true, body: { id: 'c1', status: 'active' } },
      {
        ok: true,
        body: {
          assistantMessages: [{ role: 'assistant', content: 'Proposed 3 meals.', ts: 't1', tool_calls: [] }],
          stoppedReason: 'end_turn',
          toolCallsMade: 1,
          tokensIn: 500,
          tokensOut: 20,
          drafts: [
            { id: 'd1', date: '2026-04-22', meal_type: 'dinner', source: 'recipe', recipe_id: 'r1', custom_name: null, servings: 4, assigned_to: [], notes: null, custom_ingredients: null, inventory_item_id: null, conversation_id: 'c1', created_at: 't1' },
          ],
        },
      },
    ])
    const { result } = renderHook(() => useMealGenChat({ household_id, week_start }))
    await act(async () => { await result.current.start() })
    await act(async () => { await result.current.send('Plan 3 dinners') })

    expect(result.current.messages).toHaveLength(2) // user + assistant
    expect(result.current.messages[0]).toMatchObject({ role: 'user', content: 'Plan 3 dinners' })
    expect(result.current.messages[1]).toMatchObject({ role: 'assistant', content: 'Proposed 3 meals.' })
    expect(result.current.drafts).toHaveLength(1)
  })

  it('accept() promotes drafts and flips status to accepted', async () => {
    mockFetchSequence([
      { ok: true, body: { id: 'c1', status: 'active' } },
      { ok: true, body: { inserted_ids: ['e1', 'e2'] } },
    ])
    const { result } = renderHook(() => useMealGenChat({ household_id, week_start }))
    await act(async () => { await result.current.start() })
    await act(async () => { await result.current.accept() })

    expect(result.current.status).toBe('accepted')
  })

  it('discard() marks abandoned', async () => {
    mockFetchSequence([
      { ok: true, body: { id: 'c1', status: 'active' } },
      { ok: true, body: { ok: true } },
    ])
    const { result } = renderHook(() => useMealGenChat({ household_id, week_start }))
    await act(async () => { await result.current.start() })
    await act(async () => { await result.current.discard() })

    expect(result.current.status).toBe('abandoned')
  })

  it('surfaces error on 429 from start()', async () => {
    mockFetchSequence([
      { ok: false, status: 429, body: { error: 'Daily meal-gen conversation limit reached for this household' } },
    ])
    const { result } = renderHook(() => useMealGenChat({ household_id, week_start }))
    await act(async () => { await result.current.start() })

    expect(result.current.conversationId).toBeNull()
    expect(result.current.error).toMatch(/Daily meal-gen/)
  })

  it('resume() loads an existing conversation + drafts', async () => {
    mockFetchSequence([
      {
        ok: true,
        body: {
          conversation: {
            id: 'c7',
            status: 'active',
            messages: [
              { role: 'user', content: 'earlier question', ts: 't0' },
              { role: 'assistant', content: 'earlier answer', ts: 't1' },
            ],
          },
          drafts: [],
        },
      },
    ])
    const { result } = renderHook(() => useMealGenChat({ household_id, week_start }))
    await act(async () => { await result.current.resume('c7') })

    expect(result.current.conversationId).toBe('c7')
    expect(result.current.status).toBe('active')
    expect(result.current.messages).toHaveLength(2)
  })

  it('refreshShoppingPreview() fetches and stores the preview', async () => {
    mockFetchSequence([
      { ok: true, body: { id: 'c1', status: 'active' } },
      {
        ok: true,
        body: {
          items: [
            { name: 'carrot', required_qty: 600, required_unit: 'g', packed_qty: 1000, packed_unit: 'g', waste_qty: 400, pack_size: { quantity: 1, unit: 'kg' }, pack_count: 1, is_staple: false },
          ],
          totals: { line_count: 1, waste_qty_total: 400, pack_total: 1 },
        },
      },
    ])
    const { result } = renderHook(() => useMealGenChat({ household_id, week_start }))
    await act(async () => { await result.current.start() })
    await act(async () => { await result.current.refreshShoppingPreview() })
    expect(result.current.shoppingPreview?.items).toHaveLength(1)
    expect(result.current.shoppingPreview?.totals.line_count).toBe(1)
  })
})
