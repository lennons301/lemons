import type { ToolContext, ToolResult } from '../types'

export interface RemoveSlotInput {
  date: string
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack'
}

export async function removeSlot(
  ctx: ToolContext,
  input: RemoveSlotInput,
): Promise<ToolResult<{ ok: true } | { error: string }>> {
  const { error } = await ctx.supabase
    .from('meal_gen_drafts')
    .delete()
    .eq('conversation_id', ctx.conversationId)
    .eq('date', input.date)
    .eq('meal_type', input.meal_type)

  if (error) {
    return { content: { error: error.message }, is_error: true }
  }
  return { content: { ok: true } }
}
