import type { ToolContext, ToolResult } from '../types'

export interface GetRecipeInput {
  recipe_id: string
}

export interface GetRecipeOutput {
  id: string
  title: string
  description: string | null
  servings: number
  prep_time: number | null
  cook_time: number | null
  instructions: unknown
  ingredients: Array<{
    raw_text: string
    quantity: number | null
    unit: string | null
    name: string | null
    notes: string | null
    optional: boolean
  }>
}

export async function getRecipe(
  ctx: ToolContext,
  input: GetRecipeInput,
): Promise<ToolResult<GetRecipeOutput | { error: string }>> {
  const { data: recipe, error: recipeError } = await ctx.supabase
    .from('recipes')
    .select('id, title, description, servings, prep_time, cook_time, instructions')
    .eq('id', input.recipe_id)
    .eq('household_id', ctx.householdId)
    .maybeSingle()

  if (recipeError || !recipe) {
    return {
      content: { error: `Recipe ${input.recipe_id} not found in this household.` },
      is_error: true,
    }
  }

  const { data: ingredients, error: ingError } = await ctx.supabase
    .from('recipe_ingredients')
    .select('raw_text, quantity, unit, name, notes, optional')
    .eq('recipe_id', input.recipe_id)
    .order('sort_order', { ascending: true })

  if (ingError) {
    return { content: { error: `Failed to load ingredients: ${ingError.message}` }, is_error: true }
  }

  return {
    content: {
      ...recipe,
      ingredients: (ingredients ?? []).map((i) => ({
        raw_text: i.raw_text ?? '',
        quantity: i.quantity,
        unit: i.unit,
        name: i.name,
        notes: i.notes,
        optional: i.optional ?? false,
      })),
    },
  }
}
