import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { MealGenConversationRow } from '@/types/meal-gen'
import type { HouseholdContext } from './prompt'
import type { CatalogRecipe } from './catalog-index'

export interface ConversationContext {
  conversation: MealGenConversationRow
  household: HouseholdContext['household']
  catalogRecipes: CatalogRecipe[]
  apiKey?: string
}

function personToMember(row: { display_name: string | null; date_of_birth: string | null; person_type: string }): { name: string; role: 'adult' | 'managed'; age?: number } {
  const name = row.display_name ?? '(unnamed)'
  if (row.person_type === 'member') return { name, role: 'adult' }
  if (row.date_of_birth) {
    const dob = new Date(row.date_of_birth)
    const today = new Date()
    let age = today.getUTCFullYear() - dob.getUTCFullYear()
    const m = today.getUTCMonth() - dob.getUTCMonth()
    if (m < 0 || (m === 0 && today.getUTCDate() < dob.getUTCDate())) age -= 1
    return { name, role: 'managed', age }
  }
  return { name, role: 'managed' }
}

export async function loadConversationContext(
  supabase: SupabaseClient<Database>,
  conversationId: string,
): Promise<ConversationContext | null> {
  const { data: conversation } = await supabase
    .from('meal_gen_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle()

  if (!conversation) return null

  // Load the household's Anthropic key separately (same pattern as /api/recipes/extract).
  // Keeping this out of the Promise.all batch gives a clearer failure mode if it's the
  // key specifically that can't be read, rather than a bulk batch error.
  const { data: householdKey } = await supabase
    .from('households')
    .select('anthropic_api_key')
    .eq('id', conversation.household_id)
    .single()

  const [personsRes, staplesRes, recipesRes] = await Promise.all([
    supabase.from('household_persons').select('id, display_name, date_of_birth, person_type').eq('household_id', conversation.household_id),
    supabase.from('household_staples').select('name').eq('household_id', conversation.household_id),
    supabase.from('recipes').select('id, title, recipe_tags(tag_name)').eq('household_id', conversation.household_id),
  ])

  const members = (personsRes.data ?? []).map(personToMember)
  const staples = (staplesRes.data ?? []).map((s) => s.name)
  const catalogRecipes: CatalogRecipe[] = (recipesRes.data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    tags: ((r.recipe_tags ?? []) as Array<{ tag_name: string }>).map((t) => t.tag_name),
  }))

  const rawKey = householdKey?.anthropic_api_key?.trim()

  return {
    conversation: conversation as unknown as MealGenConversationRow,
    household: {
      members,
      staples,
      locale: 'UK',
    },
    catalogRecipes,
    apiKey: rawKey && rawKey.length > 0 ? rawKey : undefined,
  }
}
