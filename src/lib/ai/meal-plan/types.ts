import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import type { MealGenMessage, MealGenDraftSource } from '@/types/meal-gen'

export interface ToolContext {
  supabase: SupabaseClient<Database>
  householdId: string
  userId: string
  conversationId: string
}

export interface ToolResult<T = unknown> {
  content: T
  is_error?: boolean
}

export interface ProposedEntry {
  date: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
  source: MealGenDraftSource
  recipe_id?: string | null
  inventory_item_id?: string | null
  custom_name?: string | null
  custom_ingredients?: Array<{ name: string; quantity: number | null; unit: string | null }> | null
  servings?: number
  assigned_to?: string[]
  notes?: string | null
}

export interface TurnResult {
  assistantMessages: MealGenMessage[]
  stoppedReason: 'end_turn' | 'max_tokens' | 'tool_cap' | 'error'
  toolCallsMade: number
  tokensIn: number
  tokensOut: number
}
