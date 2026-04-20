import type { Database } from './database'

// DB row aliases
export type MealGenConversationRow = Database['public']['Tables']['meal_gen_conversations']['Row']
export type MealGenDraftRow = Database['public']['Tables']['meal_gen_drafts']['Row']
export type PacketSizeRow = Database['public']['Tables']['packet_sizes']['Row']

// Conversation message envelope (stored inside meal_gen_conversations.messages jsonb)
export type MealGenMessageRole = 'user' | 'assistant' | 'system' | 'tool'

export interface MealGenMessage {
  role: MealGenMessageRole
  content: string
  tool_calls?: MealGenToolCall[]
  tool_results?: MealGenToolResult[]
  ts: string // ISO timestamp
}

export interface MealGenToolCall {
  id: string
  name: MealGenToolName
  input: Record<string, unknown>
}

export interface MealGenToolResult {
  tool_call_id: string
  content: unknown
  is_error?: boolean
}

// Tool names exposed to the LLM. Implementations land in chunk 2.
export type MealGenToolName =
  | 'get_recipe'
  | 'search_web'
  | 'scrape_and_save_recipe'
  | 'search_inventory_leftovers'
  | 'get_calendar_events'
  | 'check_packet_sizes'
  | 'propose_plan'
  | 'remove_slot'

// Custom-ingredient shape (stored in meal_gen_drafts.custom_ingredients and meal_plan_entries.custom_ingredients).
export interface CustomIngredient {
  name: string
  quantity: number | null
  unit: string | null
}

// Packet rounding metadata (lives on todo_items.metadata for shopping items).
export interface PacketRoundingMetadata {
  required_qty: number
  packed_qty: number
  waste_qty: number
  pack_size: { quantity: number; unit: string }
}

// Draft source discriminator — matches the CHECK on meal_gen_drafts.source.
export type MealGenDraftSource =
  | 'recipe'
  | 'custom'
  | 'custom_with_ingredients'
  | 'leftover'
