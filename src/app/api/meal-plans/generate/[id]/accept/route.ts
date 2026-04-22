import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'
import { acceptConversation } from '@/lib/ai/meal-plan/accept'

// POST /api/meal-plans/generate/[id]/accept — promote drafts to meal_plan_entries
export async function POST(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const result = await acceptConversation(supabase, id, user.id)
    return NextResponse.json(result, { status: 200 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = /already|no drafts|not found/i.test(msg) ? 409 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
