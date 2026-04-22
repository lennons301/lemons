import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notFoundIfDisabled } from '@/lib/ai/meal-plan/gate'
import { isHouseholdAtDailyCap } from '@/lib/ai/meal-plan/limits'

// POST /api/meal-plans/generate — create a new meal-gen conversation
export async function POST(request: NextRequest) {
  const disabled = notFoundIfDisabled()
  if (disabled) return disabled

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null) as { household_id?: string; week_start?: string } | null
  if (!body?.household_id || !body?.week_start) {
    return NextResponse.json({ error: 'household_id and week_start are required' }, { status: 400 })
  }

  if (await isHouseholdAtDailyCap(supabase, body.household_id)) {
    return NextResponse.json({ error: 'Daily meal-gen conversation limit reached for this household' }, { status: 429 })
  }

  const { data, error } = await supabase
    .from('meal_gen_conversations')
    .insert({
      household_id: body.household_id,
      created_by: user.id,
      week_start: body.week_start,
    })
    .select('id, household_id, created_by, week_start, status, created_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create conversation' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
