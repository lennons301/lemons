import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'

// GET /api/meal-plans/generate/[id] — full conversation + drafts for resume
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [conversationRes, draftsRes] = await Promise.all([
    supabase.from('meal_gen_conversations').select('*').eq('id', id).maybeSingle(),
    supabase.from('meal_gen_drafts').select('*').eq('conversation_id', id).order('date', { ascending: true }),
  ])

  if (!conversationRes.data) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
  }

  return NextResponse.json({
    conversation: conversationRes.data,
    drafts: draftsRes.data ?? [],
  })
}
