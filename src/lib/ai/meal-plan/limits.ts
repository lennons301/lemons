import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { MealGenMessage } from '@/types/meal-gen'
import {
  MEAL_GEN_MAX_MESSAGES_PER_CONVERSATION,
  MEAL_GEN_MAX_TOOL_CALLS_PER_CONVERSATION,
  MEAL_GEN_MAX_DAILY_CONVERSATIONS,
} from './config'

export function isConversationAtMessageCap(messages: MealGenMessage[]): boolean {
  return messages.length >= MEAL_GEN_MAX_MESSAGES_PER_CONVERSATION
}

export function countToolCalls(messages: MealGenMessage[]): number {
  return messages.reduce((acc, m) => acc + (m.tool_calls?.length ?? 0), 0)
}

export function isConversationAtToolCallCap(messages: MealGenMessage[]): boolean {
  return countToolCalls(messages) >= MEAL_GEN_MAX_TOOL_CALLS_PER_CONVERSATION
}

export async function isHouseholdAtDailyCap(
  supabase: SupabaseClient<Database>,
  householdId: string,
): Promise<boolean> {
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)
  const { count, error } = await supabase
    .from('meal_gen_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    .gte('created_at', startOfDay.toISOString())
  if (error) return false
  return (count ?? 0) >= MEAL_GEN_MAX_DAILY_CONVERSATIONS
}
