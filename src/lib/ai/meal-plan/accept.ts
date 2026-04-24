import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import { buildShoppingFromDrafts } from './shopping-for-drafts'

export interface AcceptResult {
  inserted_ids: string[]
  shopping_list_id: string | null
  shopping_item_count: number
}

export async function acceptConversation(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  userId: string,
): Promise<AcceptResult> {
  const { data: conversation } = await supabase
    .from('meal_gen_conversations')
    .select('id, household_id, status, week_start')
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

  // Generate the shopping list. This is best-effort — if shopping generation
  // fails we still consider the accept successful (entries exist) but return
  // shopping_list_id: null so the UI can surface a retry option.
  let shopping_list_id: string | null = null
  let shopping_item_count = 0
  try {
    const shopping = await buildShoppingFromDrafts(supabase, conversationId)
    if (shopping && shopping.items.length > 0) {
      const { data: list, error: listError } = await supabase
        .from('todo_lists')
        .insert({
          household_id: conversation.household_id,
          title: `Shopping — week of ${conversation.week_start}`,
          list_type: 'shopping',
          created_by: userId,
        })
        .select('id')
        .single()

      if (!listError && list) {
        const itemRows = shopping.items.map((item, index) => ({
          list_id: list.id,
          title: item.name,
          quantity: item.packed_qty,
          unit: item.packed_unit,
          sort_order: index,
          created_by: userId,
          metadata: {
            required_qty: item.required_qty,
            packed_qty: item.packed_qty,
            waste_qty: item.waste_qty,
            pack_size: item.pack_size,
            pack_count: item.pack_count,
            is_staple: item.is_staple,
          } as unknown as Json,
        }))
        const { error: itemsError } = await supabase.from('todo_items').insert(itemRows)
        if (!itemsError) {
          shopping_list_id = list.id
          shopping_item_count = itemRows.length
        }
      }
    }
  } catch {
    // swallow — shopping list is optional on accept
  }

  const { error: updateError } = await supabase
    .from('meal_gen_conversations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
    })
    .eq('id', conversationId)

  if (updateError) {
    throw new Error(
      `meal_plan_entries inserted but failed to mark conversation accepted: ${updateError.message}`,
    )
  }

  return { inserted_ids: (inserted ?? []).map((r) => r.id), shopping_list_id, shopping_item_count }
}
