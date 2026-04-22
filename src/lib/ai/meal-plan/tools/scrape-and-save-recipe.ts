import type { ToolContext, ToolResult } from '../types'
import { extractRecipeFromUrl } from '@/lib/ai/extract-recipe-from-url'

export interface ScrapeAndSaveRecipeInput {
  url: string
}

export interface ScrapeAndSaveRecipeOutput {
  recipe_id: string
  title: string
  reused: boolean
}

async function getHouseholdApiKey(
  supabase: ToolContext['supabase'],
  householdId: string,
): Promise<string | undefined> {
  const { data } = await supabase
    .from('households')
    .select('anthropic_api_key')
    .eq('id', householdId)
    .maybeSingle()
  return (data as { anthropic_api_key?: string } | null)?.anthropic_api_key ?? undefined
}

export async function scrapeAndSaveRecipe(
  ctx: ToolContext,
  input: ScrapeAndSaveRecipeInput,
): Promise<ToolResult<ScrapeAndSaveRecipeOutput | { error: string }>> {
  const { data: existing } = await ctx.supabase
    .from('recipes')
    .select('id, title')
    .eq('source_url', input.url)
    .eq('household_id', ctx.householdId)
    .maybeSingle()

  if (existing) {
    return { content: { recipe_id: existing.id, title: existing.title, reused: true } }
  }

  let extraction
  try {
    const apiKey = await getHouseholdApiKey(ctx.supabase, ctx.householdId)
    extraction = await extractRecipeFromUrl(input.url, apiKey)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { content: { error: `Scrape failed: ${msg}` }, is_error: true }
  }

  const { data: inserted, error: insertError } = await ctx.supabase
    .from('recipes')
    .insert({
      title: extraction.title,
      description: extraction.description,
      servings: extraction.servings,
      prep_time: extraction.prep_time,
      cook_time: extraction.cook_time,
      instructions: extraction.instructions,
      source_url: input.url,
      source_author: extraction.source_author,
      source_book: extraction.source_book,
      household_id: ctx.householdId,
      created_by: ctx.userId,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    return { content: { error: `Failed to save recipe: ${insertError?.message ?? 'unknown'}` }, is_error: true }
  }

  const ingredientRows = extraction.ingredients.map((ing, i) => ({
    recipe_id: inserted.id,
    raw_text: ing.raw_text,
    quantity: ing.quantity,
    unit: ing.unit,
    name: ing.name,
    notes: ing.notes,
    sort_order: i,
  }))
  if (ingredientRows.length > 0) {
    await ctx.supabase.from('recipe_ingredients').insert(ingredientRows)
  }

  return { content: { recipe_id: inserted.id, title: extraction.title, reused: false } }
}
