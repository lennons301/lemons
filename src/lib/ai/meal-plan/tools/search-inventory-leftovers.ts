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

export async function searchInventoryLeftovers(
  ctx: ToolContext,
  _input: SearchInventoryLeftoversInput,
): Promise<ToolResult<InventoryLeftoverOutput[]>> {
  const { data, error } = await ctx.supabase
    .from('inventory_items')
    .select('id, display_name, cooked_servings, source_recipe_id, expiry_date')
    .eq('household_id', ctx.householdId)
    .eq('is_cooked_meal', true)
    .gt('cooked_servings', 0)

  if (error) {
    return { content: [], is_error: true }
  }

  return {
    content: (data ?? []).map((row) => ({
      id: row.id,
      name: row.display_name ?? '(unnamed leftover)',
      servings_available: Number(row.cooked_servings ?? 0),
      source_recipe_id: row.source_recipe_id ?? null,
      expiry_date: row.expiry_date ?? null,
    })),
  }
}
