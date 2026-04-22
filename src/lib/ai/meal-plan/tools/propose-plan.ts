import type { ToolContext, ToolResult, ProposedEntry } from '../types'

export interface ProposePlanInput {
  entries: ProposedEntry[]
}

export interface ProposePlanOutput {
  draft_ids: string[]
}

function validate(entry: ProposedEntry): string | null {
  switch (entry.source) {
    case 'recipe':
      if (!entry.recipe_id) return 'source=recipe requires recipe_id'
      return null
    case 'leftover':
      if (!entry.inventory_item_id) return 'source=leftover requires inventory_item_id'
      return null
    case 'custom':
      if (!entry.custom_name) return 'source=custom requires custom_name'
      return null
    case 'custom_with_ingredients':
      if (!entry.custom_name || !entry.custom_ingredients || entry.custom_ingredients.length === 0) {
        return 'source=custom_with_ingredients requires custom_name and custom_ingredients'
      }
      return null
  }
}

export async function proposePlan(
  ctx: ToolContext,
  input: ProposePlanInput,
): Promise<ToolResult<ProposePlanOutput | { error: string }>> {
  for (const entry of input.entries) {
    const err = validate(entry)
    if (err) return { content: { error: err }, is_error: true }
  }

  const rows = input.entries.map((e) => ({
    conversation_id: ctx.conversationId,
    date: e.date,
    meal_type: e.meal_type,
    source: e.source,
    recipe_id: e.source === 'recipe' ? e.recipe_id! : null,
    inventory_item_id: e.source === 'leftover' ? e.inventory_item_id! : null,
    custom_name: (e.source === 'custom' || e.source === 'custom_with_ingredients') ? e.custom_name! : null,
    custom_ingredients: e.source === 'custom_with_ingredients' ? (e.custom_ingredients as unknown) : null,
    servings: e.servings ?? 1,
    assigned_to: e.assigned_to ?? [],
    notes: e.notes ?? null,
  }))

  const { data, error } = await ctx.supabase
    .from('meal_gen_drafts')
    .upsert(rows, { onConflict: 'conversation_id,date,meal_type' })
    .select('id')

  if (error) {
    return { content: { error: error.message }, is_error: true }
  }

  return { content: { draft_ids: (data ?? []).map((r) => r.id) } }
}
