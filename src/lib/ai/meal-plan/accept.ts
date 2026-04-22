import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'

export interface AcceptResult {
  inserted_ids: string[]
}

export async function acceptConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  userId: string,
): Promise<AcceptResult> {
  const { data: conversation } = await supabase
    .from('meal_gen_conversations')
    .select('id, household_id, status')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conversation) throw new Error(`Conversation ${conversationId} not found`)
  if (conversation.status !== 'active') {
    throw new Error(`Conversation ${conversationId} is already ${conversation.status}`)
  }

  const { data: drafts } = await supabase
    .from('meal_gen_drafts')
    .select('id, date, meal_type, source, recipe_id, inventory_item_id, custom_name, custom_ingredients, servings, assigned_to, notes')
    .eq('conversation_id', conversationId)
    .order('date', { ascending: true })

  if (!drafts || drafts.length === 0) {
    throw new Error('Cannot accept: no drafts on this conversation')
  }

  const rows = drafts.map((d) => ({
    household_id: conversation.household_id,
    date: d.date,
    meal_type: d.meal_type,
    recipe_id: d.recipe_id,
    inventory_item_id: d.inventory_item_id,
    custom_name: d.custom_name,
    custom_ingredients: d.custom_ingredients as Json | null,
    servings: d.servings,
    assigned_to: d.assigned_to,
    created_by: userId,
    notes: d.notes,
    status: 'planned' as const,
  }))

  const { data: inserted, error: insertError } = await supabase
    .from('meal_plan_entries')
    .insert(rows)
    .select('id')

  if (insertError) throw new Error(`Failed to insert meal plan entries: ${insertError.message}`)

  await supabase
    .from('meal_gen_conversations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  return { inserted_ids: (inserted ?? []).map((r) => r.id) }
}
