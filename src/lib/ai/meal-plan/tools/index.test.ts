/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest'
import { dispatchTool, TOOL_REGISTRY } from './index'
import type { ToolContext } from '../types'

describe('TOOL_REGISTRY', () => {
  it('contains all 7 custom tools', () => {
    expect(Object.keys(TOOL_REGISTRY).sort()).toEqual([
      'check_packet_sizes',
      'get_calendar_events',
      'get_recipe',
      'propose_plan',
      'remove_slot',
      'scrape_and_save_recipe',
      'search_inventory_leftovers',
    ])
  })
})

describe('dispatchTool', () => {
  it('routes to the named tool', async () => {
    const ctx: ToolContext = { supabase: {} as any, householdId: 'h1', userId: 'u1', conversationId: 'c1' }
    const fake = vi.fn(() => Promise.resolve({ content: { ok: true } }))
    const result = await dispatchTool('propose_plan', ctx, { entries: [] }, { propose_plan: fake } as any)
    expect(fake).toHaveBeenCalledWith(ctx, { entries: [] })
    expect(result.content).toEqual({ ok: true })
  })

  it('returns an error result for unknown tool name', async () => {
    const ctx: ToolContext = { supabase: {} as any, householdId: 'h1', userId: 'u1', conversationId: 'c1' }
    const result = await dispatchTool('not_a_tool' as any, ctx, {})
    expect(result.is_error).toBe(true)
  })
})
