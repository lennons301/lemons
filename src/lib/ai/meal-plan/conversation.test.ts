/* eslint-disable @typescript-eslint/no-explicit-any */
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

  it('persists a tool envelope so replay emits tool_result blocks after every tool_use', async () => {
    // Regression: without a 'tool' role envelope between assistant turns, the
    // second user message produces 400 "ids were found without tool_blocks"
    // because the replayed history has tool_use blocks not followed by tool_result.
    const dispatch = vi.fn(() => Promise.resolve({ content: { ok: true } }))
    const client = fakeClient([
      {
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Checking.' },
          { type: 'tool_use', id: 'tu1', name: 'check_packet_sizes', input: { ingredient_names: ['onion'] } },
        ],
        usage: { input_tokens: 100, output_tokens: 10 },
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Done.' }],
        usage: { input_tokens: 120, output_tokens: 5 },
      },
    ])
    const result = await runTurn({ ...baseState }, 'plan', ctx, { client, dispatch })

    // After turn 1 we expect three persisted envelopes: assistant(tool_use), tool(tool_result), assistant(text).
    expect(result.assistantMessages.map((m) => m.role)).toEqual(['assistant', 'tool', 'assistant'])
    const toolEnvelope = result.assistantMessages[1]
    expect(toolEnvelope.tool_results).toHaveLength(1)
    expect(toolEnvelope.tool_results?.[0].tool_call_id).toBe('tu1')

    // Now simulate a follow-up message: the persisted envelopes feed back as `prior`
    // and the next API call must contain the tool_result blocks paired with tu1.
    const followUpClient = fakeClient([
      { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Ack.' }], usage: { input_tokens: 50, output_tokens: 2 } },
    ])
    const create = followUpClient.messages.create as ReturnType<typeof vi.fn>
    await runTurn(
      { ...baseState, prior: [{ role: 'user', content: 'plan', ts: '' }, ...result.assistantMessages] },
      'and breakfast?',
      ctx,
      { client: followUpClient, dispatch },
    )
    const sentMessages = create.mock.calls[0][0].messages as any[]
    // Find the assistant message with tool_use; the next message must be a user with tool_result for tu1.
    const toolUseIdx = sentMessages.findIndex((m: any) =>
      m.role === 'assistant' && Array.isArray(m.content) && m.content.some((b: any) => b.type === 'tool_use' && b.id === 'tu1'),
    )
    expect(toolUseIdx).toBeGreaterThanOrEqual(0)
    const next = sentMessages[toolUseIdx + 1]
    expect(next.role).toBe('user')
    expect(next.content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'tu1' })
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
