import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'

// POST /api/meal-plans/generate/[id]/discard — mark conversation abandoned
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: conversation } = await supabase
    .from('meal_gen_conversations')
    .select('id, status')
    .eq('id', id)
    .maybeSingle()

  if (!conversation) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  if (conversation.status !== 'active') {
    return NextResponse.json({ error: `Conversation is ${conversation.status}` }, { status: 409 })
  }

  const { error } = await supabase
    .from('meal_gen_conversations')
    .update({ status: 'abandoned' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
