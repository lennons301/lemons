import { describe, it, expect, vi } from 'vitest'
import { runTurn, type AnthropicLike } from './conversation'
import type { ToolContext } from './types'
import type { MealGenMessage } from '@/types/meal-gen'

function fakeClient(responses: any[]): AnthropicLike {
  let i = 0
  return {
    messages: {
      create: vi.fn(() => Promise.resolve(responses[i++] ?? { stop_reason: 'end_turn', content: [] })),
    },
  }
}

const ctx: ToolContext = { supabase: {} as any, householdId: 'h1', userId: 'u1', conversationId: 'c1' }

const baseState = {
  systemPrompt: 'system',
  prior: [] as MealGenMessage[],
  apiKey: 'test-key',
}

describe('runTurn', () => {
  it('returns end_turn when the model replies without tool calls', async () => {
    const client = fakeClient([
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Hello!' }],
        usage: { input_tokens: 100, output_tokens: 5 },
      },
    ])
    const result = await runTurn(
      { ...baseState },
      'Plan my week',
      ctx,
      { client, dispatch: vi.fn() },
    )
    expect(result.stoppedReason).toBe('end_turn')
    expect(result.assistantMessages[0].content).toContain('Hello!')
    expect(result.toolCallsMade).toBe(0)
  })

  it('executes a tool call and feeds the result back until end_turn', async () => {
    const dispatch = vi.fn(() => Promise.resolve({ content: { ok: true } }))
    const client = fakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Let me check packets.' },
          { type: 'tool_use', id: 'tu1', name: 'check_packet_sizes', input: { ingredient_names: ['onion'] } },
        ],
        usage: { input_tokens: 120, output_tokens: 10 },
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Done.' }],
        usage: { input_tokens: 140, output_tokens: 5 },
      },
    ])
    const result = await runTurn({ ...baseState }, 'Plan my week', ctx, { client, dispatch })
    expect(dispatch).toHaveBeenCalledWith('check_packet_sizes', ctx, { ingredient_names: ['onion'] })
    expect(result.toolCallsMade).toBe(1)
    expect(result.stoppedReason).toBe('end_turn')
  })

  it('halts at MEAL_GEN_MAX_TOOL_TURNS to prevent infinite loops', async () => {
    const dispatch = vi.fn(() => Promise.resolve({ content: {} }))
    const toolResponse = {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't', name: 'check_packet_sizes', input: {} }],
      usage: { input_tokens: 10, output_tokens: 1 },
    }
    const client = fakeClient(Array(100).fill(toolResponse))
    const result = await runTurn({ ...baseState }, 'looping', ctx, { client, dispatch })
    expect(result.stoppedReason).toBe('tool_cap')
  })
})
