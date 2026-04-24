import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'
import { buildShoppingFromDrafts } from '@/lib/ai/meal-plan/shopping-for-drafts'

// GET /api/meal-plans/generate/[id]/shopping-preview — packet-rounded preview
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const { id } = await ctx.params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await buildShoppingFromDrafts(supabase, id)
  if (!result) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })

  return NextResponse.json(result)
}
