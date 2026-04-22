import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import type { MealGenMessage } from '@/types/meal-gen'

export async function appendMessages(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  newMessages: MealGenMessage[],
  tokensIn: number,
  tokensOut: number,
): Promise<void> {
  const { data: existing } = await supabase
    .from('meal_gen_conversations')
    .select('messages, metadata')
    .eq('id', conversationId)
    .maybeSingle()

  if (!existing) return

  const priorMessages = (existing.messages as unknown as MealGenMessage[] | null) ?? []
  const priorMeta = (existing.metadata as { tokens_in?: number; tokens_out?: number } | null) ?? {}

  const combinedMessages = [...priorMessages, ...newMessages]
  const nextMetadata = {
    ...(existing.metadata as Record<string, unknown> | null ?? {}),
    tokens_in: (priorMeta.tokens_in ?? 0) + tokensIn,
    tokens_out: (priorMeta.tokens_out ?? 0) + tokensOut,
  }

  await supabase
    .from('meal_gen_conversations')
    .update({
      messages: combinedMessages as unknown as Json,
      metadata: nextMetadata as unknown as Json,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
}
