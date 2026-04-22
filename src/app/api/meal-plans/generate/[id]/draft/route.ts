import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'
import { appendMessages } from '@/lib/ai/meal-plan/persist'
import type { MealGenMessage } from '@/types/meal-gen'

// PATCH /api/meal-plans/generate/[id]/draft — user-edited a draft from the grid
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as {
    date?: string
    meal_type?: string
    update?: Record<string, unknown>
    action?: 'update' | 'delete'
  } | null

  if (!body?.date || !body?.meal_type || !body.action) {
    return NextResponse.json({ error: 'date, meal_type, and action are required' }, { status: 400 })
  }

  if (body.action === 'delete') {
    const { error } = await supabase
      .from('meal_gen_drafts')
      .delete()
      .eq('conversation_id', id)
      .eq('date', body.date)
      .eq('meal_type', body.meal_type)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    if (!body.update) return NextResponse.json({ error: 'update payload required for action=update' }, { status: 400 })
    const { error } = await supabase
      .from('meal_gen_drafts')
      .update(body.update)
      .eq('conversation_id', id)
      .eq('date', body.date)
      .eq('meal_type', body.meal_type)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const note: MealGenMessage = {
    role: 'user',
    content: `(User edited ${body.date} ${body.meal_type} in the grid: ${body.action}${body.update ? ' ' + JSON.stringify(body.update) : ''})`,
    ts: new Date().toISOString(),
  }
  await appendMessages(supabase, id, [note], 0, 0)

  return NextResponse.json({ ok: true })
}
