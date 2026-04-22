import Anthropic from '@anthropic-ai/sdk'
import type { MealGenMessage, MealGenToolName } from '@/types/meal-gen'
import type { ToolContext, TurnResult } from './types'
import { MEAL_GEN_MODEL, MEAL_GEN_MAX_TOKENS, MEAL_GEN_MAX_TOOL_TURNS } from './config'
import { TOOL_SCHEMAS, WEB_SEARCH_SERVER_TOOL } from './tool-schemas'
import { dispatchTool } from './tools'

// Minimal interface the orchestrator needs from the SDK — lets us inject fakes in tests.
export interface AnthropicLike {
  messages: {
    create: (params: any) => Promise<any>
  }
}

export interface RunTurnState {
  systemPrompt: string
  prior: MealGenMessage[]
  apiKey?: string
}

export interface RunTurnDeps {
  client?: AnthropicLike
  dispatch?: typeof dispatchTool
}

function now(): string {
  return new Date().toISOString()
}

export async function runTurn(
  state: RunTurnState,
  userMessage: string,
  ctx: ToolContext,
  deps: RunTurnDeps = {},
): Promise<TurnResult> {
  const client: AnthropicLike = deps.client ?? (new Anthropic(state.apiKey ? { apiKey: state.apiKey } : undefined) as unknown as AnthropicLike)
  const dispatch = deps.dispatch ?? dispatchTool

  const messages: any[] = [
    ...state.prior.map(envelopeToSdk),
    { role: 'user', content: userMessage },
  ]

  const assistantMessages: MealGenMessage[] = []
  let tokensIn = 0
  let tokensOut = 0
  let toolCallsMade = 0
  let stoppedReason: TurnResult['stoppedReason'] = 'end_turn'

  for (let turn = 0; turn < MEAL_GEN_MAX_TOOL_TURNS; turn++) {
    const response = await client.messages.create({
      model: MEAL_GEN_MODEL,
      max_tokens: MEAL_GEN_MAX_TOKENS,
      system: [{ type: 'text', text: state.systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools: [...TOOL_SCHEMAS, WEB_SEARCH_SERVER_TOOL as any],
      messages,
    })

    tokensIn += response.usage?.input_tokens ?? 0
    tokensOut += response.usage?.output_tokens ?? 0

    // Capture the assistant's message for history.
    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('\n')
    const toolUses = response.content.filter((b: any) => b.type === 'tool_use')

    assistantMessages.push({
      role: 'assistant',
      content: text,
      tool_calls: toolUses.map((tu: any) => ({ id: tu.id, name: tu.name, input: tu.input })),
      ts: now(),
    })

    // Record the model's raw turn in messages so the next iteration has full context.
    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason === 'tool_use' && toolUses.length > 0) {
      const toolResults: any[] = []
      for (const tu of toolUses) {
        const result = await dispatch(tu.name as MealGenToolName, ctx, tu.input)
        toolCallsMade += 1
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result.content),
          is_error: result.is_error ?? false,
        })
      }
      messages.push({ role: 'user', content: toolResults })
      continue
    }

    if (response.stop_reason === 'max_tokens') {
      stoppedReason = 'max_tokens'
      break
    }
    stoppedReason = 'end_turn'
    break
  }

  // If we exited the for-loop without break, we hit the tool cap.
  if (stoppedReason === 'end_turn' && assistantMessages.length > 0 &&
      (assistantMessages[assistantMessages.length - 1].tool_calls?.length ?? 0) > 0) {
    stoppedReason = 'tool_cap'
  }

  return { assistantMessages, stoppedReason, toolCallsMade, tokensIn, tokensOut }
}

// Convert our stored envelope back to the SDK message format when replaying history.
function envelopeToSdk(msg: MealGenMessage): any {
  if (msg.role === 'user' || msg.role === 'system') {
    return { role: 'user', content: msg.content }
  }
  if (msg.role === 'assistant') {
    const content: any[] = []
    if (msg.content) content.push({ type: 'text', text: msg.content })
    for (const tc of msg.tool_calls ?? []) {
      content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input })
    }
    return { role: 'assistant', content }
  }
  if (msg.role === 'tool') {
    const content = (msg.tool_results ?? []).map((tr) => ({
      type: 'tool_result',
      tool_use_id: tr.tool_call_id,
      content: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
      is_error: tr.is_error ?? false,
    }))
    return { role: 'user', content }
  }
  return { role: 'user', content: msg.content }
}
