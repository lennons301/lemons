import type { ToolContext, ToolResult } from '../types'

export interface SearchInventoryLeftoversInput {
  meal_type?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
}

export interface InventoryLeftoverOutput {
  id: string
  name: string
  servings_available: number
  source_recipe_id: string | null
  expiry_date: string | null
}

// Stubbed until inventory_items gains the cooked-meal columns
// (is_cooked_meal, cooked_servings, source_recipe_id). The design spec
// calls for these; the schema work lands in a later chunk. For now the
// tool returns empty so the model sees "no leftovers available" —
// matching the "gracefully empty today, lights up later" design note.
export async function searchInventoryLeftovers(
  _ctx: ToolContext,
  _input: SearchInventoryLeftoversInput,
): Promise<ToolResult<InventoryLeftoverOutput[]>> {
  return { content: [] }
}
