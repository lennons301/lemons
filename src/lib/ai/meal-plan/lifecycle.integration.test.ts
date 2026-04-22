/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { runTurn } from './conversation'
import { buildSystemPrompt } from './prompt'
import { buildCatalogIndex } from './catalog-index'
import { acceptConversation } from './accept'

describe('meal-gen lifecycle (library only — no HTTP)', () => {
  it('runs a turn that proposes a plan, then accept promotes drafts', async () => {
    // --- Stage 1: model turn that calls propose_plan once, then end_turn ---
    const fakeClient = {
      messages: {
        create: vi.fn()
          .mockResolvedValueOnce({
            stop_reason: 'tool_use',
            content: [
              { type: 'text', text: 'Here is a quick plan.' },
              {
                type: 'tool_use',
                id: 'tu1',
                name: 'propose_plan',
                input: {
                  entries: [
                    { date: '2026-04-22', meal_type: 'dinner', source: 'recipe', recipe_id: 'r1', servings: 4 },
                  ],
                },
              },
            ],
            usage: { input_tokens: 500, output_tokens: 30 },
          })
          .mockResolvedValueOnce({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'Done.' }],
            usage: { input_tokens: 520, output_tokens: 10 },
          }),
      },
    }

    const fakeDispatch = vi.fn(() => Promise.resolve({ content: { draft_ids: ['d1'] } }))
    const ctx = { supabase: {} as any, householdId: 'h1', userId: 'u1', conversationId: 'c1' }
    const systemPrompt = buildSystemPrompt({
      household: { members: [{ name: 'Sean', role: 'adult' }], staples: [], locale: 'UK' },
      catalogIndex: buildCatalogIndex([{ id: 'r1', title: 'Curry', tags: ['dinner'] }]),
    })

    const result = await runTurn(
      { systemPrompt, prior: [], apiKey: 'sk' },
      'Plan dinner for Wednesday',
      ctx,
      { client: fakeClient, dispatch: fakeDispatch },
    )

    expect(result.stoppedReason).toBe('end_turn')
    expect(result.toolCallsMade).toBe(1)
    expect(result.assistantMessages).toHaveLength(2)
    expect(fakeDispatch).toHaveBeenCalledWith('propose_plan', ctx, expect.any(Object))

    // --- Stage 2: accept the conversation ---
    const supabaseAccept: any = {
      from: vi.fn((t: string) => {
        if (t === 'meal_gen_conversations') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: 'c1', household_id: 'h1', status: 'active' }, error: null }),
              }),
            }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }
        }
        if (t === 'meal_gen_drafts') {
          return {
            select: () => ({
              eq: () => ({
                order: () => Promise.resolve({
                  data: [
                    { id: 'd1', date: '2026-04-22', meal_type: 'dinner', source: 'recipe', recipe_id: 'r1', inventory_item_id: null, custom_name: null, custom_ingredients: null, servings: 4, assigned_to: [], notes: null },
                  ],
                  error: null,
                }),
              }),
            }),
            delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }
        }
        if (t === 'meal_plan_entries') {
          return {
            insert: () => ({
              select: () => Promise.resolve({ data: [{ id: 'e1' }], error: null }),
            }),
          }
        }
        throw new Error('unexpected table ' + t)
      }),
    }

    const acceptResult = await acceptConversation(supabaseAccept, 'c1', 'u1')
    expect(acceptResult.inserted_ids).toEqual(['e1'])
  })
})
