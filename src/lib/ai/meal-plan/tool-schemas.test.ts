import { describe, it, expect } from 'vitest'
import { TOOL_SCHEMAS, WEB_SEARCH_SERVER_TOOL } from './tool-schemas'
import type { MealGenToolName } from '@/types/meal-gen'

describe('TOOL_SCHEMAS', () => {
  const expectedNames: MealGenToolName[] = [
    'get_recipe',
    'scrape_and_save_recipe',
    'search_inventory_leftovers',
    'get_calendar_events',
    'check_packet_sizes',
    'propose_plan',
    'remove_slot',
  ]

  it('defines a schema for every custom tool name', () => {
    for (const name of expectedNames) {
      expect(TOOL_SCHEMAS.some((s) => s.name === name), `missing schema: ${name}`).toBe(true)
    }
  })

  it('every schema has name, description, and input_schema', () => {
    for (const schema of TOOL_SCHEMAS) {
      expect(schema.name).toBeTruthy()
      expect(schema.description).toBeTruthy()
      expect(schema.input_schema).toBeTruthy()
      expect(schema.input_schema.type).toBe('object')
    }
  })

  it('exposes the Anthropic server-side web_search tool config', () => {
    expect(WEB_SEARCH_SERVER_TOOL.type).toMatch(/^web_search/)
  })
})
