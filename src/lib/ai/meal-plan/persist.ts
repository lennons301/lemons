import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database'
import type { MealGenMessage } from '@/types/meal-gen'

// Known v1 limitation: this is a read-modify-write on the messages jsonb with no
// optimistic lock. Two concurrent writers on the same conversation (e.g. an in-flight
// /message POST and a PATCH /draft from the grid) can lose one side's append. The UI
// serializes its own writes and the /message route 409s on non-active status, so in
// practice the collision window is narrow. Chunk 4 (or whoever tightens accept
// atomicity) should consider moving to an RPC / optimistic concurrency via updated_at.
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
