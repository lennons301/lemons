import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'
import { loadConversationContext } from '@/lib/ai/meal-plan/context'
import { buildCatalogIndex } from '@/lib/ai/meal-plan/catalog-index'
import { buildSystemPrompt } from '@/lib/ai/meal-plan/prompt'
import { runTurn } from '@/lib/ai/meal-plan/conversation'
import { appendMessages } from '@/lib/ai/meal-plan/persist'
import {
  isConversationAtMessageCap,
  isConversationAtToolCallCap,
} from '@/lib/ai/meal-plan/limits'
import type { MealGenMessage } from '@/types/meal-gen'

// POST /api/meal-plans/generate/[id]/message — append user message, run model turn
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as { text?: string } | null
  if (!body?.text || !body.text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  const loaded = await loadConversationContext(supabase, id)
  if (!loaded) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  if (loaded.conversation.status !== 'active') {
    return NextResponse.json({ error: `Conversation is ${loaded.conversation.status}` }, { status: 409 })
  }
  // No preflight on apiKey — runTurn passes undefined through to the Anthropic
  // SDK, which falls back to ANTHROPIC_API_KEY from the environment. This mirrors
  // /api/recipes/extract, which has relied on the env fallback since launch.

  const prior = (loaded.conversation.messages as unknown as MealGenMessage[] | null) ?? []
  if (isConversationAtMessageCap(prior)) {
    return NextResponse.json({ error: 'Conversation message cap reached' }, { status: 429 })
  }
  if (isConversationAtToolCallCap(prior)) {
    return NextResponse.json({ error: 'Conversation tool-call cap reached' }, { status: 429 })
  }

  const systemPrompt = buildSystemPrompt({
    household: loaded.household,
    catalogIndex: buildCatalogIndex(loaded.catalogRecipes),
  })

  let result
  try {
    result = await runTurn(
      { systemPrompt, prior, apiKey: loaded.apiKey },
      body.text,
      { supabase, householdId: loaded.conversation.household_id, userId: user.id, conversationId: id },
    )
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Model turn failed: ${msg}` }, { status: 502 })
  }

  const userMessage: MealGenMessage = { role: 'user', content: body.text, ts: new Date().toISOString() }
  await appendMessages(
    supabase,
    id,
    [userMessage, ...result.assistantMessages],
    result.tokensIn,
    result.tokensOut,
  )

  const { data: drafts } = await supabase
    .from('meal_gen_drafts')
    .select('*')
    .eq('conversation_id', id)
    .order('date', { ascending: true })

  return NextResponse.json({
    assistantMessages: result.assistantMessages,
    stoppedReason: result.stoppedReason,
    toolCallsMade: result.toolCallsMade,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    drafts: drafts ?? [],
  })
}
